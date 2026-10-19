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
    search_fields = ['code', 'color__name']
    list_select_related = ['color__filament__brand', 'color__filament__material']
    readonly_fields = ['code']
    autocomplete_fields = ['color']
