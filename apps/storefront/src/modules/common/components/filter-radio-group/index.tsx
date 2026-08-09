import { Label, RadioGroup, clx } from "@modules/common/components/ui"
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
    <section aria-labelledby={`${groupId}-title`}>
      <h2
        id={`${groupId}-title`}
        className="text-sm font-semibold text-content-primary"
      >
        {title}
      </h2>
      <RadioGroup className="mt-3 gap-2" data-testid={dataTestId}>
        <legend className="sr-only">{title}</legend>
        {items.map((item) => {
          const isSelected = item.value === value

          return (
            <div key={item.value} className="relative">
              <RadioGroup.Item
                checked={isSelected}
                onChange={() => handleChange(item.value)}
                className="peer sr-only"
                id={`${groupId}-${item.value}`}
                name={groupId}
                value={item.value}
              />
              <Label
                htmlFor={`${groupId}-${item.value}`}
                className={clx(
                  "flex min-h-11 items-center gap-3 rounded-lg border border-transparent px-3 text-sm leading-snug text-content-secondary motion-safe:transition-[background-color,border-color,color] motion-safe:duration-150 hover:cursor-pointer hover:bg-surface-subtle peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
                  {
                    "border-line-control bg-surface-subtle font-semibold text-content-primary":
                      isSelected,
                  },
                )}
                data-testid="radio-label"
                data-active={isSelected}
              >
                <span
                  aria-hidden="true"
                  className={clx(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-line-control",
                    {
                      "border-action-primary": isSelected,
                    },
                  )}
                >
                  {isSelected && (
                    <span className="h-2 w-2 rounded-full bg-action-primary" />
                  )}
                </span>
                <span>{item.label}</span>
              </Label>
            </div>
          )
        })}
      </RadioGroup>
    </section>
  )
}

export default FilterRadioGroup
