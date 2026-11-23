#!/usr/bin/env python
"""Django's command-line utility for administrative tasks."""
import os
import sys

def main():
    """Run administrative tasks."""
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'fato_backend.settings')
    try:
        from django.core.management import execute_from_command_line
    except ImportError:
        # Sem Django instalado: o servidor Node atende as rotas /api/*
        print("Django não está instalado. Rode: pip install -r requirements.txt")
        print("Enquanto isso, as rotas /api/* são atendidas pelo servidor Node.")
        sys.exit(0)
    execute_from_command_line(sys.argv)

if __name__ == '__main__':
    main()
