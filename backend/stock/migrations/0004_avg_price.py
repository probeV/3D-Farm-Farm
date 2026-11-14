# v2 PL: 품목의 평균 단가(이동평균) · 입출고 기록의 그때 단가.
# 이미 있는 기록은 stock/services.py recalc() 와 같은 방법으로 채운다 (마이그레이션은 그때 모델로 돌아야 해서 따로 적음)

from decimal import Decimal

from django.db import migrations, models

START_NOTE = '처음 수량'
Q4 = Decimal('0.0001')


def q4(value):
    return None if value is None else Decimal(value).quantize(Q4)


def mix(stock, avg, qty, price):
    base = max(stock, Decimal(0))
    if avg is None or base == 0:
        return Decimal(price)
    return (base * avg + qty * Decimal(price)) / (base + qty)


def fill(apps, schema_editor):
    Part = apps.get_model('stock', 'Part')
    StockHistory = apps.get_model('stock', 'StockHistory')
    ExpenseItem = apps.get_model('expenses', 'ExpenseItem')
    for part in Part.objects.all():
        last = None if part.price is None else Decimal(part.price) / Decimal(part.pack_qty)
        buys = list(ExpenseItem.objects.filter(part=part).select_related('expense'))
        rows = list(StockHistory.objects.filter(part=part).exclude(kind='buy'))
        events = [(b.expense.date, b.expense.created_at, b, None) for b in buys if b.qty > 0]
        events += [(h.date, h.created_at, None, h) for h in rows]
        events.sort(key=lambda e: (e[0], e[1]))
        stock, avg = Decimal(0), None
        for _, _, buy, row in events:
            if buy is not None:
                avg = mix(stock, avg, buy.qty, buy.total / buy.qty)
                stock += buy.qty
                continue
            if row.kind == 'adjust' and row.note == START_NOTE:
                # 처음 등록할 때 구매가는 남아 있지 않아 지금 구매가로 (지출로 산 적이 있으면 최근 구매가)
                row.unit_price = q4(last)
                if row.qty > 0 and last is not None:
                    avg = mix(stock, avg, row.qty, last)
            else:
                row.unit_price = q4(avg if avg is not None else last)
            stock += row.qty
        StockHistory.objects.bulk_update(rows, ['unit_price'])
        part.avg_price = q4(avg)
        part.save(update_fields=['avg_price'])


class Migration(migrations.Migration):
    dependencies = [
        ('stock', '0003_stockhistory_expense'),
        ('expenses', '0003_buy_items'),
    ]

    operations = [
        migrations.AddField(
            model_name='part',
            name='avg_price',
            field=models.DecimalField(
                blank=True, decimal_places=4, editable=False, max_digits=14, null=True, verbose_name='평균 단가'
            ),
        ),
        migrations.AddField(
            model_name='stockhistory',
            name='unit_price',
            field=models.DecimalField(blank=True, decimal_places=4, max_digits=14, null=True, verbose_name='개당 단가'),
        ),
        migrations.RunPython(fill, migrations.RunPython.noop),
    ]
