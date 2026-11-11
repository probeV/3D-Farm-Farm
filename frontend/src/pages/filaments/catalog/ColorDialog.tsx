import type { CSSProperties } from 'react'
import type { Filament } from '../../../api/filaments'
import Dialog from '../../../components/Dialog'
import Field from '../../../components/Field'
import { won } from '../../../format'
import { useColorEditor, type ColorEditor } from './useColorEditor'

// 색상 창 머리: 그 색상의 옅은 그라데이션 띠 (입력 중인 색상 코드를 따라 바뀜, TBD-14)
export function ColorHero({ title, filament, hex }: { title: string; filament: Filament; hex: string }) {
  return (
    <div className="color-hero" style={{ '--c': hex } as CSSProperties}>
      <span className="chip" />
      <div>
        <div className="t">{title}</div>
        <div className="s">{filament.display_name}</div>
      </div>
      <code>{hex}</code>
    </div>
  )
}

// 색상 입력칸: 회사 · 필라멘트(고정) · 이름 · 색상 코드 · 가격
export function ColorFields({ filament, editor: ed }: { filament: Filament; editor: ColorEditor }) {
  return (
    <div className="form-grid">
      <Field label="회사 *">
        <select disabled>
          <option>{filament.brand_name}</option>
        </select>
      </Field>
      <Field label="필라멘트 *">
        <select disabled>
          <option>{filament.series ? `${filament.material_name} ${filament.series}` : filament.material_name}</option>
        </select>
      </Field>
      <Field label="색상 이름 *" error={ed.errors.name}>
        <input value={ed.values.name} placeholder="예: 화이트" onChange={(e) => ed.change('name', e.target.value)} />
      </Field>
      <Field
        label="색상 코드 *"
        error={ed.hexError}
        hint={ed.hexOk ? `${ed.hexOk} 로 저장 (붙여넣기 예: F5F5F5, #f5f5f5)` : undefined}
      >
        <div className="hex-input">
          <input
            value={ed.values.hex}
            placeholder="#F5F5F5"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => ed.change('hex', e.target.value)}
          />
          <span className="hex-preview" style={{ background: ed.hexOk ?? 'transparent' }} />
          <input
            type="color"
            title="색 선택기"
            value={(ed.hexOk ?? '#CCCCCC').toLowerCase()}
            onChange={(e) => ed.change('hex', e.target.value.toUpperCase())}
          />
        </div>
      </Field>
      <Field
        label="가격"
        error={ed.errors.price}
        hint={`비우면 필라멘트 가격 ${filament.price == null ? '(미입력)' : won(filament.price)} 사용`}
      >
        <div className="with-suffix">
          <input
            inputMode="numeric"
            value={ed.values.price}
            placeholder={filament.price != null ? String(filament.price) : ''}
            onChange={(e) => ed.change('price', e.target.value)}
          />
          <em>원</em>
        </div>
      </Field>
    </div>
  )
}

interface Props {
  filament: Filament // `+ 색상` 타일에서만 열리므로 필라멘트는 항상 고정
  onClose: () => void
}

// 색상 추가 (docs/screens.md 1.6). 수정은 색상 · 스풀 관리 창(ColorManageDialog)의 색상 정보 탭에서
export default function ColorDialog({ filament, onClose }: Props) {
  const ed = useColorEditor(filament, null, onClose)
  return (
    <Dialog
      header={<ColorHero title="색상 추가" filament={filament} hex={ed.shown} />}
      onClose={onClose}
      submitLabel="저장"
      onSubmit={ed.save}
      busy={ed.busy}
    >
      <ColorFields filament={filament} editor={ed} />
    </Dialog>
  )
}
