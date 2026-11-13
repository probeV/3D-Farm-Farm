"""재고 관리 (v2 STOCK): 테이블 이름을 stock_* 로, 품목 종류(kind) · 사진 · 남은 수량 · 부족 알림 기준,
입출고 기록(StockHistory) · 포장 세트(PackSet · PackSetLine)."""

import django.core.validators
import django.db.models.deletion
import django.utils.timezone
import filaments.models
from decimal import Decimal
from django.db import migrations, models

KIND_CHOICES = [('part', '부속품'), ('pack', '포장재'), ('supply', '소모품')]


class Migration(migrations.Migration):

    dependencies = [
        ('stock', '0001_initial'),
        ('products', '0006_move_part_to_stock'),
        ('sales', '0001_initial'),
    ]

    operations = [
        migrations.AlterModelTable(name='partcategory', table=None),
        migrations.AlterModelTable(name='part', table=None),
        migrations.AlterModelOptions(
            name='partcategory',
            options={'ordering': ['kind', 'name'], 'verbose_name': '품목 카테고리', 'verbose_name_plural': '품목 카테고리'},
        ),
        migrations.AlterModelOptions(
            name='part',
            options={'ordering': ['name'], 'verbose_name': '재고 품목', 'verbose_name_plural': '재고 품목'},
        ),
        migrations.AddField(
            model_name='partcategory',
            name='kind',
            field=models.CharField(choices=KIND_CHOICES, default='part', max_length=10, verbose_name='종류'),
        ),
        migrations.AlterField(
            model_name='partcategory',
            name='name',
            field=models.CharField(max_length=50, verbose_name='이름'),
        ),
        migrations.AddConstraint(
            model_name='partcategory',
            constraint=models.UniqueConstraint(fields=('kind', 'name'), name='unique_part_category_name', violation_error_message='이미 있는 카테고리 이름입니다.'),
        ),
        migrations.AddField(
            model_name='part',
            name='kind',
            field=models.CharField(choices=KIND_CHOICES, default='part', max_length=10, verbose_name='종류'),
        ),
        migrations.AddField(
            model_name='part',
            name='photo',
            field=models.ImageField(blank=True, upload_to='parts/', validators=[django.core.validators.FileExtensionValidator(['png', 'jpg', 'jpeg', 'webp'], message='png, jpg, webp 이미지만 올릴 수 있습니다.'), filaments.models.validate_logo_size], verbose_name='사진'),
        ),
        migrations.AddField(
            model_name='part',
            name='stock',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12, verbose_name='남은 수량'),
        ),
        migrations.AddField(
            model_name='part',
            name='alert',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12, validators=[django.core.validators.MinValueValidator(0)], verbose_name='부족 알림 기준'),
        ),
        migrations.CreateModel(
            name='PackSet',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100, unique=True, verbose_name='세트 이름')),
                ('note', models.TextField(blank=True, verbose_name='비고')),
            ],
            options={
                'verbose_name': '포장 세트',
                'verbose_name_plural': '포장 세트',
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='PackSetLine',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('qty', models.DecimalField(decimal_places=2, default=1, max_digits=12, validators=[django.core.validators.MinValueValidator(Decimal('0.01'))], verbose_name='수량')),
                ('pack_set', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='lines', to='stock.packset', verbose_name='포장 세트')),
                ('part', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='pack_lines', to='stock.part', verbose_name='포장재')),
            ],
            options={
                'verbose_name': '포장 세트 구성',
                'verbose_name_plural': '포장 세트 구성',
                'ordering': ['id'],
            },
        ),
        migrations.CreateModel(
            name='StockHistory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField(default=django.utils.timezone.localdate, verbose_name='날짜')),
                ('kind', models.CharField(choices=[('buy', '지출'), ('sale', '판매'), ('use', '다 씀'), ('adjust', '조정')], max_length=10, verbose_name='종류')),
                ('qty', models.DecimalField(decimal_places=2, max_digits=12, verbose_name='수량')),
                ('after', models.DecimalField(decimal_places=2, max_digits=12, verbose_name='그 뒤 남은 수량')),
                ('note', models.CharField(blank=True, max_length=200, verbose_name='설명')),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='추가일')),
                ('part', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='history', to='stock.part', verbose_name='품목')),
                ('sale', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='stock_history', to='sales.sale', verbose_name='판매')),
            ],
            options={
                'verbose_name': '입출고 기록',
                'verbose_name_plural': '입출고 기록',
                'ordering': ['-date', '-id'],
                'db_table': 'stock_history',
            },
        ),
    ]
