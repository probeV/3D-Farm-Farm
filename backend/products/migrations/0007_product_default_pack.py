"""제품의 기본 포장 (v2 STOCK-06) + 기존 데이터 옮기기.

1. `포장재` 카테고리와 그 품목 → 포장 탭(kind=pack). 그 밖의 품목은 부속품 그대로
2. 제품의 부속품 줄 중 포장재 줄 → 기본 포장 세트 `{제품명} 포장` (구성이 같은 제품은 세트 하나를 같이 씀)

되돌리면(migrate products 0006) 기본 포장 세트를 다시 제품의 줄로 풀고, 모든 품목을 부속품으로 돌린다.
"""

import django.db.models.deletion
from django.db import migrations, models

PACK_CATEGORY = '포장재'


def forward(apps, schema_editor):
    PartCategory = apps.get_model('stock', 'PartCategory')
    Part = apps.get_model('stock', 'Part')
    PackSet = apps.get_model('stock', 'PackSet')
    PackSetLine = apps.get_model('stock', 'PackSetLine')
    Product = apps.get_model('products', 'Product')

    for category in PartCategory.objects.filter(name=PACK_CATEGORY):
        category.kind = 'pack'
        category.save(update_fields=['kind'])
        Part.objects.filter(category=category).update(kind='pack')

    by_lines = {}  # 구성 → 세트
    for product in Product.objects.order_by('no'):
        rows = list(product.parts.filter(part__kind='pack').order_by('id'))
        if not rows:
            continue
        lines = {}
        for row in rows:
            lines[row.part_id] = lines.get(row.part_id, 0) + row.qty
        key = tuple(sorted(lines.items()))
        pack_set = by_lines.get(key)
        if pack_set is None:
            name, n = f'{product.name} 포장', 2
            while PackSet.objects.filter(name=name).exists():
                name, n = f'{product.name} 포장 {n}', n + 1
            pack_set = PackSet.objects.create(name=name)
            PackSetLine.objects.bulk_create(PackSetLine(pack_set=pack_set, part_id=p, qty=q) for p, q in key)
            by_lines[key] = pack_set
        product.default_pack = pack_set
        product.save(update_fields=['default_pack'])
        product.parts.filter(id__in=[r.id for r in rows]).delete()


def backward(apps, schema_editor):
    Part = apps.get_model('stock', 'Part')
    PartCategory = apps.get_model('stock', 'PartCategory')
    PackSet = apps.get_model('stock', 'PackSet')
    Product = apps.get_model('products', 'Product')
    ProductPart = apps.get_model('products', 'ProductPart')

    for product in Product.objects.exclude(default_pack=None):
        for line in product.default_pack.lines.all():
            ProductPart.objects.create(product=product, part_id=line.part_id, qty=line.qty)
    Product.objects.update(default_pack=None)
    PackSet.objects.all().delete()
    Part.objects.update(kind='part')
    PartCategory.objects.update(kind='part')


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0006_move_part_to_stock'),
        ('stock', '0002_stock'),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='default_pack',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='products', to='stock.packset', verbose_name='기본 포장'),
        ),
        migrations.RunPython(forward, backward),
    ]
