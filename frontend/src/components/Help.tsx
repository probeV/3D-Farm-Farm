// (?) 에 마우스를 올리면 위로 설명 (요약 카드에 설명 문구를 쓰지 않음). 눌러도 카드의 클릭(필터)이 되지 않게 막는다
export default function Help({ tip }: { tip: string }) {
  return (
    <span className="help" tabIndex={0} data-tip={tip} onClick={(e) => e.stopPropagation()}>
      ?
    </span>
  )
}
