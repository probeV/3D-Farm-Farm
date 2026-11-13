# v2 TBD-33 · 18: 지금까지 쓴 가장 큰 스풀 번호 (지운 번호를 다시 쓰지 않게). 처음 값 = 지금 있는 가장 큰 번호

import django.db.models.deletion
from django.db import migrations, models


def start_from_largest(apps, schema_editor):
    Spool = apps.get_model('filaments', 'Spool')
    SpoolNumber = apps.get_model('filaments', 'SpoolNumber')
    largest = Spool.objects.aggregate(largest=models.Max('code_no'))['largest'] or 0
    SpoolNumber.objects.update_or_create(pk=1, defaults={'last': largest})


class Migration(migrations.Migration):
    dependencies = [
        ('expenses', '0003_buy_items'),
        ('filaments', '0004_spool_buy'),
    ]

    operations = [
        migrations.CreateModel(
            name='SpoolNumber',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('last', models.PositiveIntegerField(default=0, verbose_name='지금까지 쓴 가장 큰 번호')),
            ],
            options={'verbose_name': '스풀 번호', 'verbose_name_plural': '스풀 번호'},
        ),
        migrations.AlterField(
            model_name='spool',
            name='buy',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='spools',
                to='expenses.expenseitem',
                verbose_name='주문(구매 항목)',
            ),
        ),
        migrations.RunPython(start_from_largest, migrations.RunPython.noop),
    ]
