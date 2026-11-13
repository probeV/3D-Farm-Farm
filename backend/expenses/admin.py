from django.contrib import admin

from .models import Expense, ExpenseLine, RecurringExpense


class ExpenseLineInline(admin.TabularInline):
    """구매 줄은 보기만 (남은 수량 · 최근 구매가와 함께 바꿔야 해서 화면 · API 로)"""

    model = ExpenseLine
    extra = 0
    fields = ['color', 'part', 'qty', 'amount', 'total']
    readonly_fields = fields
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ['date', 'name', 'category', 'amount', 'shop']
    list_filter = ['category']
    search_fields = ['name', 'shop', 'note']
    date_hierarchy = 'date'
    inlines = [ExpenseLineInline]


@admin.register(RecurringExpense)
class RecurringExpenseAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'amount', 'day', 'start']
    list_filter = ['category']
    search_fields = ['name']
