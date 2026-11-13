"""부자재를 stock 앱으로 옮기기 — 2단계 (1단계: stock 0001).

제품의 부속품 줄(ProductPart.part)이 stock.Part 를 가리키게 하고, products 쪽 Part · PartCategory 모델을 지운다.
테이블은 stock 앱이 계속 쓰므로 DB 에서는 지우지 않는다 (state 만).
"""

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0005_part_category_buy_url'),
        ('stock', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='productpart',
            name='part',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='product_parts', to='stock.part', verbose_name='부속품'),
        ),
        migrations.AlterModelOptions(
            name='productpart',
            options={'ordering': ['id'], 'verbose_name': '사용 부속품', 'verbose_name_plural': '사용 부속품'},
        ),
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RemoveField(model_name='part', name='category'),
                migrations.DeleteModel(name='PartCategory'),
                migrations.DeleteModel(name='Part'),
            ],
            database_operations=[],
        ),
    ]
