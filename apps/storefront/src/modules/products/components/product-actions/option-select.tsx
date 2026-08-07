import { HttpTypes } from "@medusajs/types"
import { clx } from "@modules/common/components/ui"
import React from "react"
import { getDictionary } from "@lib/i18n"

type OptionSelectProps = {
  option: HttpTypes.StoreProductOption
  current: string | undefined
  updateOption: (title: string, value: string) => void
  title: string
  disabled: boolean
  "data-testid"?: string
}

const OptionSelect: React.FC<OptionSelectProps> = ({
  option,
  current,
  updateOption,
  title,
  "data-testid": dataTestId,
  disabled,
}) => {
  const t = getDictionary().product
  const filteredOptions = (option.values ?? []).map((v) => v.value)

  return (
    <div className="flex flex-col gap-y-3">
      <span className="text-sm">{t.selectOption} {title}</span>
      <div
        className="flex flex-wrap justify-between gap-2"
        data-testid={dataTestId}
      >
        {filteredOptions.map((v) => {
          return (
            <button
              onClick={() => updateOption(option.id, v)}
              key={v}
              aria-pressed={v === current}
              aria-label={`${title}: ${v}`}
              className={clx(
                "min-h-11 flex-1 rounded-rounded border border-line-control bg-ui-bg-subtle p-2 text-small-regular focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-border-interactive",
                {
                  "border-2 border-ui-border-interactive font-semibold":
                    v === current,
                  "shadow-elevation-card-rest motion-safe:transition-[box-shadow,scale] motion-safe:duration-150 motion-safe:ease-out hover:shadow-elevation-card-hover motion-safe:active:scale-[0.96]":
                    v !== current,
                }
              )}
              disabled={disabled}
              data-testid="option-button"
            >
              {v === current && <span className="sr-only">{t.selected} </span>}
              {v}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default OptionSelect
