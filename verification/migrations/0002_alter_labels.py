# Só altera rótulos (verbose_name); não muda colunas no banco.

from django.db import migrations, models


VERDICT_CHOICES = [
    ('Confirmada pelas evidências consultadas', 'Confirmada pelas evidências consultadas'),
    ('Contradita pelas evidências consultadas', 'Contradita pelas evidências consultadas'),
    ('Parcialmente correta ou fora de contexto', 'Parcialmente correta ou fora de contexto'),
    ('Evidências conflitantes', 'Evidências conflitantes'),
    ('Não verificada', 'Não verificada'),
    ('Afirmação não verificável', 'Afirmação não verificável'),
]


class Migration(migrations.Migration):

    dependencies = [
        ('verification', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='investigationreport',
            name='overall_assessment',
            field=models.TextField(blank=True, verbose_name='Conclusão geral'),
        ),
        migrations.AlterField(
            model_name='investigationreport',
            name='engine_used',
            field=models.CharField(blank=True, max_length=150, verbose_name='Modelo / mecanismo usado'),
        ),
        migrations.AlterField(
            model_name='claimverification',
            name='verdict',
            field=models.CharField(choices=VERDICT_CHOICES, default='Não verificada', max_length=100, verbose_name='Veredito'),
        ),
    ]
