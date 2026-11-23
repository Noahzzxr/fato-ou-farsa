"""Configurações do Django (Fato ou Farsa)."""

import os
from pathlib import Path
from dotenv import load_dotenv

# Diretório base do projeto Django
BASE_DIR = Path(__file__).resolve().parent.parent

# Carrega variáveis de ambiente do .env na raiz
env_file = BASE_DIR / '.env'
if env_file.exists():
    load_dotenv(dotenv_path=env_file)
else:
    load_dotenv()

SECRET_KEY = os.environ.get(
    'DJANGO_SECRET_KEY',
    'fato-ou-farsa-academic-tcc-secure-key-2026-tiktok-verifier-token'
)

DEBUG = os.environ.get('DJANGO_DEBUG', 'True').lower() in ('true', '1', 'yes')

ALLOWED_HOSTS = ['*']

# Aplicações instaladas
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    # Terceiros
    'rest_framework',
    'corsheaders',
    
    # Módulo principal da plataforma de verificação
    'verification.apps.VerificationConfig',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'fato_backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'dist'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'fato_backend.wsgi.application'
ASGI_APPLICATION = 'fato_backend.asgi.application'

# Banco de dados relacional via Django ORM (SQLite para pesquisa e reproduzibilidade)
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# Validação de senhas
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Internacionalização em Português do Brasil (pt-BR)
LANGUAGE_CODE = 'pt-br'
TIME_ZONE = 'America/Sao_Paulo'
USE_I18N = True
USE_TZ = True

# Arquivos estáticos
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = [
    BASE_DIR / 'public',
] if (BASE_DIR / 'public').exists() else []

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Django REST Framework
REST_FRAMEWORK = {
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ],
    'DEFAULT_PARSER_CLASSES': [
        'rest_framework.parsers.JSONParser',
        'rest_framework.parsers.FormParser',
        'rest_framework.parsers.MultiPartParser',
    ],
    'UNAUTHENTICATED_USER': None,
}

# Configurações de CORS para interoperabilidade com o frontend
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]

# Configurações Específicas do Projeto Fato ou Farsa
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash')

# Provedor Exclusivo para Contas Autorizadas TikTok: PostZen
POSTZEN_API_KEY = (os.environ.get('POSTZEN_API_KEY') or '').strip()
POSTZEN_BASE_URL = (os.environ.get('POSTZEN_BASE_URL') or '').strip().rstrip('/') or 'https://api.postzen.dev'
POSTZEN_TIMEOUT_SECONDS = float(os.environ.get('POSTZEN_TIMEOUT_SECONDS', '10'))
POSTZEN_CACHE_TTL_SECONDS = int(os.environ.get('POSTZEN_CACHE_TTL_SECONDS', '120'))
POSTZEN_MAX_RETRIES = int(os.environ.get('POSTZEN_MAX_RETRIES', '2'))

