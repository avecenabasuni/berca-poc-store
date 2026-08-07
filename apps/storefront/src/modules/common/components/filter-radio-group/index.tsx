import { EllipseMiniSolid } from "@medusajs/icons"
import { Label, RadioGroup, Text, clx } from "@modules/common/components/ui"
import { useId } from "react"
type FilterRadioGroupProps = {
  title: string
  items: {
    value: string
    label: string
  }[]
  value: string
  handleChange: (value: string) => void
  "data-testid"?: string
}

const FilterRadioGroup = ({
  title,
  items,
  value,
  handleChange,
  "data-testid": dataTestId,
}: FilterRadioGroupProps) => {
  const groupId = useId()

  return (
    <div className="flex flex-col gap-y-3">
      <Text className="txt-compact-small-plus text-ui-fg-muted">{title}</Text>
      <RadioGroup data-testid={dataTestId}>
        <legend className="sr-only">{title}</legend>
        {items?.map((i) => (
          <div key={i.value} className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-x-2">
            <span className="flex h-5 w-5 items-center justify-center">
              {i.value === value && <EllipseMiniSolid aria-hidden="true" />}
            </span>
            <RadioGroup.Item
              checked={i.value === value}
              onChange={() => handleChange(i.value)}
              className="sr-only peer"
              id={`${groupId}-${i.value}`}
              name={groupId}
              value={i.value}
            />
            <Label
              htmlFor={`${groupId}-${i.value}`}
              className={clx(
                "flex min-h-11 min-w-0 items-center rounded-sm px-2 !txt-compact-small !transform-none text-ui-fg-subtle hover:cursor-pointer peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
                {
                  "text-ui-fg-base": i.value === value,
                }
              )}
              data-testid="radio-label"
              data-active={i.value === value}
            >
              {i.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  )
}

export default FilterRadioGroup
