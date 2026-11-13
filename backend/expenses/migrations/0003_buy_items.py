# v2 TBD-33: 구매 줄(ExpenseLine) → 구매 항목(ExpenseItem). 데이터는 그대로 두고 이름만 바꾼다

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('expenses', '0002_buy_lines'),
        ('filaments', '0004_spool_buy'),
        ('stock', '0003_stockhistory_expense'),
    ]

    operations = [
        migrations.RemoveConstraint(model_name='expenseline', name='expense_line_color_or_part'),
        migrations.RenameModel(old_name='ExpenseLine', new_name='ExpenseItem'),
        migrations.AlterModelOptions(
            name='expenseitem',
            options={'ordering': ['id'], 'verbose_name': '구매 항목', 'verbose_name_plural': '구매 항목'},
        ),
        migrations.AlterField(
            model_name='expenseitem',
            name='expense',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='items',
                to='expenses.expense',
                verbose_name='지출',
            ),
        ),
        migrations.AlterField(
            model_name='expenseitem',
            name='color',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='buy_items',
                to='filaments.color',
                verbose_name='색상',
            ),
        ),
        migrations.AlterField(
            model_name='expenseitem',
            name='part',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='buy_items',
                to='stock.part',
                verbose_name='품목',
            ),
        ),
        migrations.AlterField(
            model_name='expenseitem',
            name='total',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=12, verbose_name='항목 금액'),
        ),
        migrations.AddConstraint(
            model_name='expenseitem',
            constraint=models.CheckConstraint(
                condition=models.Q(models.Q(('color__isnull', False), ('part__isnull', True)), models.Q(('color__isnull', True), ('part__isnull', False)), _connector='OR'),
                name='expense_item_color_or_part',
                violation_error_message='색상이나 품목 중 하나를 고르세요.',
            ),
        ),
    ]
