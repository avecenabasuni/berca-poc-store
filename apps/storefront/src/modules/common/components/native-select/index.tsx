import { ChevronUpDown } from "@medusajs/icons"
import { Label, clx } from "@modules/common/components/ui"
import {
  SelectHTMLAttributes,
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
} from "react"

export type NativeSelectProps = {
  placeholder?: string
  errors?: Record<string, unknown>
  touched?: Record<string, unknown>
  label?: string
  error?: string
  description?: string
} & SelectHTMLAttributes<HTMLSelectElement>

const NativeSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  (
    {
      placeholder = "Pilih…",
      defaultValue,
      className,
      children,
      label,
      error,
      description,
      errors: _errors,
      touched: _touched,
      ...props
    },
    ref
  ) => {
    const innerRef = useRef<HTMLSelectElement>(null)
    const generatedId = useId()
    const selectId = props.id ?? generatedId
    const descriptionId = `${selectId}-description`
    const errorId = `${selectId}-error`
    const describedBy = [
      props["aria-describedby"],
      description ? descriptionId : undefined,
      error ? errorId : undefined,
    ]
      .filter(Boolean)
      .join(" ") || undefined
    const [isPlaceholder, setIsPlaceholder] = useState(false)

    useImperativeHandle<HTMLSelectElement | null, HTMLSelectElement | null>(
      ref,
      () => innerRef.current
    )

    useEffect(() => {
      if (innerRef.current && innerRef.current.value === "") {
        setIsPlaceholder(true)
      } else {
        setIsPlaceholder(false)
      }
    }, [innerRef.current?.value])

    return (
      <div className="flex flex-col gap-1">
        {label && <Label htmlFor={selectId}>{label}</Label>}
        <div
          onFocus={() => innerRef.current?.focus()}
          onBlur={() => innerRef.current?.blur()}
          className={clx(
            "relative flex min-h-11 items-center rounded-md border border-line-control bg-ui-bg-subtle text-base-regular motion-safe:transition-[background-color,border-color] motion-safe:duration-150 motion-safe:ease-out hover:bg-ui-bg-field-hover focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus",
            className,
            {
              "text-ui-fg-muted": isPlaceholder,
              "border-error-foreground": error,
            }
          )}
        >
          <select
            {...props}
            ref={innerRef}
            id={selectId}
            defaultValue={defaultValue}
            aria-invalid={error ? true : props["aria-invalid"]}
            aria-describedby={describedBy}
            className="min-h-11 flex-1 appearance-none border-none bg-transparent px-4 py-2.5 outline-none"
          >
            <option disabled value="">
              {placeholder}
            </option>
            {children}
          </select>
          <span className="absolute right-4 inset-y-0 flex items-center pointer-events-none ">
            <ChevronUpDown aria-hidden="true" />
          </span>
        </div>
        {description && (
          <p id={descriptionId} className="text-small-regular text-ui-fg-subtle">
            {description}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-small-regular text-error-foreground">
            <span className="font-semibold">Kesalahan:</span> {error}
          </p>
        )}
      </div>
    )
  }
)

NativeSelect.displayName = "NativeSelect"

export default NativeSelect
