import django.core.validators
import django.db.models.deletion
from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0001_initial'),
        ('stock', '0002_stock'),
    ]

    operations = [
        migrations.CreateModel(
            name='SalePack',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('part_name', models.CharField(blank=True, max_length=100, verbose_name='포장재 이름')),
                ('qty', models.DecimalField(decimal_places=2, default=1, max_digits=12, validators=[django.core.validators.MinValueValidator(Decimal('0.01'))], verbose_name='수량')),
                ('unit_price', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True, verbose_name='개당 단가')),
                ('part', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='sale_packs', to='stock.part', verbose_name='포장재')),
                ('sale', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='packs', to='sales.sale', verbose_name='판매')),
            ],
            options={
                'verbose_name': '판매 포장',
                'verbose_name_plural': '판매 포장',
                'ordering': ['id'],
            },
        ),
    ]
