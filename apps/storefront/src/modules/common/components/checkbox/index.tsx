import React from "react"

type CheckboxProps = {
  checked?: boolean
  onChange?: () => void
  label: string
  name?: string
  id?: string
  'data-testid'?: string
}

const CheckboxWithLabel: React.FC<CheckboxProps> = ({
  checked = true,
  onChange,
  label,
  name,
  id,
  'data-testid': dataTestId
}) => {
  const checkboxId = id || name || "checkbox"
  return (
    <label
      htmlFor={checkboxId}
      className="flex min-h-11 cursor-pointer items-center gap-x-3 text-base-regular"
    >
      <input
        type="checkbox"
        id={checkboxId}
        checked={checked}
        onChange={() => onChange?.()}
        name={name}
        data-testid={dataTestId}
        className="h-5 w-5 rounded border-line-control text-content-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />
      <span>{label}</span>
    </label>
  )
}

export default CheckboxWithLabel
