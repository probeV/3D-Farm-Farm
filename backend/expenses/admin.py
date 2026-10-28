from django.contrib import admin

from .models import Expense, RecurringExpense


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = ['date', 'name', 'category', 'amount', 'shop']
    list_filter = ['category']
    search_fields = ['name', 'shop', 'note']
    date_hierarchy = 'date'


@admin.register(RecurringExpense)
class RecurringExpenseAdmin(admin.ModelAdmin):
    list_display = ['name', 'category', 'amount', 'day', 'start']
    list_filter = ['category']
    search_fields = ['name']
