"use client"

import { IconBadge, clx } from "@modules/common/components/ui"
import {
  SelectHTMLAttributes,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"

import ChevronDown from "@modules/common/icons/chevron-down"

type NativeSelectProps = {
  placeholder?: string
  errors?: Record<string, unknown>
  touched?: Record<string, unknown>
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "size">

const CartItemSelect = forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ placeholder = "Select...", className, children, ...props }, ref) => {
    const innerRef = useRef<HTMLSelectElement>(null)
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
      <div>
        <IconBadge
          className={clx(
            "group relative flex items-center border text-ui-fg-base txt-compact-small focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus",
            className,
            {
              "text-ui-fg-subtle": isPlaceholder,
            }
          )}
        >
          <select
            ref={innerRef}
            aria-label={props["aria-label"] || "Select quantity"}
            {...props}
            className="h-16 w-16 appearance-none items-center justify-center border-none bg-transparent px-4 outline-none motion-safe:transition-colors"
          >
            <option disabled value="">
              {placeholder}
            </option>
            {children}
          </select>
          <span className="absolute flex pointer-events-none justify-end w-8 group-hover:animate-pulse">
            <ChevronDown aria-hidden="true" />
          </span>
        </IconBadge>
      </div>
    )
  }
)

CartItemSelect.displayName = "CartItemSelect"

export default CartItemSelect
