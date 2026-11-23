import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import http from 'http';
import { defineConfig, Plugin } from 'vite';
import dotenv from 'dotenv';
import { spawn, spawnSync } from 'child_process';

dotenv.config();

const PYTHON_PORT = process.env.PYTHON_BACKEND_PORT || 5001;

import { dispatchApiRoute } from './server/apiRouter.ts';

function pythonBackendPlugin(): Plugin {
  let pythonProc: any = null;

  return {
    name: 'python-backend-plugin',
    configureServer(server) {
      // Sobe o Django junto com o Vite, se estiver instalado
      const checkAndStartPython = () => {
        const testReq = http.get(`http://127.0.0.1:${PYTHON_PORT}/healthz`, (res) => {
          console.log(`[django] já está rodando na porta ${PYTHON_PORT}.`);
        });
        testReq.on('error', () => {
          try {
            const check = spawnSync('python3', ['-c', 'import django'], { timeout: 2000 });
            if (check.status !== 0) {
              console.log('[django] não instalado; as rotas /api/* serão atendidas pelo Node.');
              return;
            }
          } catch {
            return;
          }

          console.log(`[django] iniciando na porta ${PYTHON_PORT}...`);
          try {
            pythonProc = spawn('python3', ['manage.py', 'runserver', `127.0.0.1:${PYTHON_PORT}`, '--noreload'], {
              stdio: 'pipe',
              env: { ...process.env, PYTHON_BACKEND_PORT: String(PYTHON_PORT) },
            });
            pythonProc.on('error', (err: any) => {
              console.log('[django] não foi possível iniciar; usando as rotas do Node:', err.message);
            });
            pythonProc.stderr?.on('data', (d: any) => {
              const msg = d.toString();
              if (!msg.includes('Watching for file changes')) {
                console.log(`[django] ${msg.trim()}`);
              }
            });
          } catch (e: any) {
            console.log('[django] Python não encontrado; usando as rotas do Node:', e.message);
          }
        });
      };

      checkAndStartPython();

      // Arquivos de verificação de domínio do TikTok for Developers
      server.middlewares.use((req, res, next) => {
        if (req.url && (req.url.includes('tiktoklvFvYxrZ5bGEB7EajcbCN2zJ4L4a82D7') || req.url.endsWith('tiktoklvFvYxrZ5bGEB7EajcbCN2zJ4L4a82D7.txt'))) {
          res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          });
          res.end('tiktok-developers-site-verification=lvFvYxrZ5bGEB7EajcbCN2zJ4L4a82D7');
          return;
        }

        if (req.url && (req.url.includes('tiktokZfEi1aZfdFYmDRv9B6lTL27s84k5onH4') || req.url.endsWith('tiktokZfEi1aZfdFYmDRv9B6lTL27s84k5onH4.txt'))) {
          res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          });
          res.end('tiktok-developers-site-verification=ZfEi1aZfdFYmDRv9B6lTL27s84k5onH4');
          return;
        }

        if (req.url && (req.url.includes('tiktokxts82qpO8iLaL1fGs8u4PKDqrmihlMWx') || req.url.endsWith('tiktokxts82qpO8iLaL1fGs8u4PKDqrmihlMWx.txt'))) {
          res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          });
          res.end('tiktok-developers-site-verification=xts82qpO8iLaL1fGs8u4PKDqrmihlMWx');
          return;
        }

        next();
      });

      // /api/*: tenta o Django; se estiver fora do ar ou subindo, usa dispatchApiRoute (Node)
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          return next();
        }

        const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = urlObj.pathname;
        const query: Record<string, string> = {};
        urlObj.searchParams.forEach((v, k) => {
          query[k] = v;
        });

        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        const bodyBuffer = Buffer.concat(chunks);
        let parsedBody: any = {};
        if (bodyBuffer.length > 0) {
          try {
            parsedBody = JSON.parse(bodyBuffer.toString('utf-8'));
          } catch {
            parsedBody = bodyBuffer.toString('utf-8');
          }
        }

        const handleInternalFallback = async () => {
          try {
            const protoHeader = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
            const origin = req.headers.host ? `${protoHeader}://${req.headers.host}` : undefined;
            const acceptHeader = String(req.headers.accept || '');
            const result = await dispatchApiRoute(pathname, req.method || 'GET', parsedBody, query, {
              origin,
              acceptHeader,
            });
            if (result.redirectTo) {
              res.writeHead(result.status, {
                Location: result.redirectTo,
                'Cache-Control': 'no-store',
              });
              res.end();
              return;
            }
            res.writeHead(result.status, {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            });
            res.end(JSON.stringify(result.data));
          } catch (internalErr: any) {
            console.error('[api]', internalErr);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: internalErr?.message || 'Erro interno' }));
          }
        };

        const options: http.RequestOptions = {
          hostname: '127.0.0.1',
          port: PYTHON_PORT,
          path: req.url,
          method: req.method,
          headers: {
            ...req.headers,
            host: `127.0.0.1:${PYTHON_PORT}`,
            'content-length': String(bodyBuffer.length),
          },
          timeout: 4000,
        };

        const proxyReq = http.request(options, (proxyRes) => {
          // 404 no Django: a rota só existe no Node
          if (proxyRes.statusCode === 404) {
            handleInternalFallback();
            return;
          }
          res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          proxyRes.pipe(res);
        });

        proxyReq.on('error', () => {
          handleInternalFallback();
        });

        proxyReq.on('timeout', () => {
          proxyReq.destroy();
          handleInternalFallback();
        });

        if (bodyBuffer.length > 0) {
          proxyReq.write(bodyBuffer);
        }
        proxyReq.end();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), pythonBackendPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
