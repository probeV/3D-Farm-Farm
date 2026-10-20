from django.contrib import admin

from .models import Brand, Color, Filament, Material, Spool


@admin.register(Brand)
class BrandAdmin(admin.ModelAdmin):
    list_display = ['name', 'logo']
    search_fields = ['name']


@admin.register(Material)
class MaterialAdmin(admin.ModelAdmin):
    search_fields = ['name']


class ColorInline(admin.TabularInline):
    model = Color
    extra = 0


@admin.register(Filament)
class FilamentAdmin(admin.ModelAdmin):
    list_display = ['name', 'price', 'spool_g']
    list_filter = ['brand', 'material']
    search_fields = ['brand__name', 'material__name', 'series']
    list_select_related = ['brand', 'material']
    inlines = [ColorInline]

    @admin.display(description='필라멘트', ordering='brand__name')
    def name(self, obj):
        return obj.display_name


@admin.register(Color)
class ColorAdmin(admin.ModelAdmin):
    list_display = ['name', 'filament', 'hex', 'price']
    list_filter = ['filament__brand', 'filament__material']
    search_fields = ['name', 'filament__brand__name', 'filament__material__name', 'filament__series']
    list_select_related = ['filament__brand', 'filament__material']


@admin.register(Spool)
class SpoolAdmin(admin.ModelAdmin):
    list_display = ['code', 'color', 'status', 'price', 'purchased_at', 'opened_at', 'finished_at']
    list_filter = ['status', 'color__filament__brand', 'purchased_at']
    search_fields = ['color__name']
    list_select_related = ['color__filament__brand', 'color__filament__material']
    autocomplete_fields = ['color']

    @admin.display(description='스풀 코드', ordering='code_no')
    def code(self, obj):
        return obj.code

    def get_search_results(self, request, queryset, search_term):
        """색상 이름 검색에 더해, 스풀 코드(S00012)로도 찾기. 코드를 번호로 바꿔서 찾는다"""
        results, may_have_duplicates = super().get_search_results(request, queryset, search_term)
        try:
            results |= queryset.filter(code_no=Spool.code_no_from_code(search_term))
        except ValueError:
            pass
        return results, may_have_duplicates
