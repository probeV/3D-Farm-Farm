import type { Brand } from '../../api/filaments'

// 회사 대표 이미지. 없으면 회사 이름 첫 글자 (PRD FIL-01a)
export default function BrandLogo({ brand, size }: { brand: Pick<Brand, 'name' | 'logo'>; size?: 'md' | 'lg' }) {
  return (
    <span className={size ? `logo ${size}` : 'logo'}>
      {brand.logo ? <img src={brand.logo} alt="" /> : brand.name[0]}
    </span>
  )
}
