"""부자재(Part · PartCategory)를 products 앱에서 stock 앱으로 옮긴다 — 1단계.

테이블(products_part · products_partcategory)과 데이터는 그대로 두고, Django 가 아는 모델의 소속만 stock 으로.
(state 만 만들고 DB 는 건드리지 않음 — SeparateDatabaseAndState). 이어서:
products 0006 — 제품의 부속품 줄이 stock.Part 를 가리키게 하고 products 쪽 모델을 지움 (역시 state 만)
stock 0002 — 테이블 이름을 stock_* 로 바꾸고 재고 관리(v2 STOCK) 칸 · 모델 추가
"""

import django.core.validators
import django.db.models.deletion
from decimal import Decimal
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('products', '0005_part_category_buy_url'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name='PartCategory',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('name', models.CharField(max_length=50, unique=True, verbose_name='이름')),
                    ],
                    options={
                        'verbose_name': '부자재 카테고리',
                        'verbose_name_plural': '부자재 카테고리',
                        'ordering': ['name'],
                        'db_table': 'products_partcategory',
                    },
                ),
                migrations.CreateModel(
                    name='Part',
                    fields=[
                        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                        ('name', models.CharField(max_length=100, unique=True, verbose_name='품목')),
                        ('category', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='parts', to='stock.partcategory', verbose_name='카테고리')),
                        ('shop', models.CharField(blank=True, max_length=100, verbose_name='회사/구매처')),
                        ('buy_url', models.URLField(blank=True, max_length=500, verbose_name='구매 링크')),
                        ('price', models.DecimalField(blank=True, decimal_places=0, max_digits=10, null=True, validators=[django.core.validators.MinValueValidator(0)], verbose_name='묶음 구매가')),
                        ('pack_qty', models.DecimalField(decimal_places=2, default=1, max_digits=10, validators=[django.core.validators.MinValueValidator(Decimal('0.01'))], verbose_name='묶음 수량')),
                        ('unit', models.CharField(default='개', max_length=10, verbose_name='단위')),
                        ('note', models.TextField(blank=True, verbose_name='메모')),
                    ],
                    options={
                        'verbose_name': '부자재',
                        'verbose_name_plural': '부자재',
                        'ordering': ['name'],
                        'db_table': 'products_part',
                    },
                ),
            ],
            database_operations=[],
        ),
    ]
