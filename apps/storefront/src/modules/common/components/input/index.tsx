import { Label, clx } from "@modules/common/components/ui"
import React, { useEffect, useId, useImperativeHandle, useState } from "react"

import Eye from "@modules/common/icons/eye"
import EyeOff from "@modules/common/icons/eye-off"

type InputProps = Omit<
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
  "placeholder"
> & {
  label: string
  errors?: Record<string, unknown>
  touched?: Record<string, unknown>
  error?: string
  description?: string
  name: string
  topLabel?: string
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      type,
      name,
      label,
      errors: _errors,
      touched: _touched,
      error,
      description,
      required,
      topLabel,
      className,
      ...props
    },
    ref
  ) => {
    const inputRef = React.useRef<HTMLInputElement>(null)
    const generatedId = useId()
    const inputId = props.id || `${name}-${generatedId}`
    const descriptionId = `${inputId}-description`
    const errorId = `${inputId}-error`
    const describedBy = [
      props["aria-describedby"],
      description ? descriptionId : undefined,
      error ? errorId : undefined,
    ]
      .filter(Boolean)
      .join(" ") || undefined
    const [showPassword, setShowPassword] = useState(false)
    const [inputType, setInputType] = useState(type)

    useEffect(() => {
      if (type === "password" && showPassword) {
        setInputType("text")
      }

      if (type === "password" && !showPassword) {
        setInputType("password")
      }
    }, [type, showPassword])

    useImperativeHandle(ref, () => inputRef.current!)

    return (
      <div className="flex flex-col w-full">
        {topLabel && (
          <Label htmlFor={inputId} className="mb-2 txt-compact-medium-plus">{topLabel}</Label>
        )}
        <div className="flex relative z-0 w-full txt-compact-medium">
          <input
            {...props}
            type={inputType}
            name={name}
            id={inputId}
            placeholder=" "
            required={required}
            spellCheck={type === "email" ? false : props.spellCheck}
            aria-invalid={error ? true : props["aria-invalid"]}
            aria-describedby={describedBy}
            className={clx(
              "pt-4 pb-1 block w-full min-h-11 px-4 mt-0 bg-ui-bg-field border rounded-md appearance-none text-base border-ui-border-base hover:bg-ui-bg-field-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
              type === "password" && "pr-12",
              error && "border-error-foreground",
              className
            )}
            ref={inputRef}
          />
          <label
            htmlFor={inputId}
            className="absolute top-3 -z-1 mx-3 flex origin-0 items-center justify-center px-1 text-ui-fg-subtle motion-safe:transition-[transform,color] motion-safe:duration-150 motion-safe:ease-out"
          >
            {label}
            {required && (
              <span className="text-error-foreground" aria-hidden="true">
                *
              </span>
            )}
          </label>
          {type === "password" && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-ui-fg-subtle motion-safe:transition-[color,scale] motion-safe:duration-150 motion-safe:ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus focus:text-ui-fg-base motion-safe:active:scale-[0.96]"
            >
              {showPassword ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
            </button>
          )}
        </div>
        {description && (
          <p id={descriptionId} className="mt-1 text-small-regular text-ui-fg-subtle">
            {description}
          </p>
        )}
        {error && (
          <p id={errorId} className="mt-1 text-small-regular text-error-foreground">
            <span className="font-semibold">Error:</span> {error}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = "Input"

export default Input
