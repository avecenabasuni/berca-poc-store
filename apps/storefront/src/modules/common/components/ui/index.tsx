import clsx from "clsx"
import {
  ButtonHTMLAttributes,
  FieldsetHTMLAttributes,
  forwardRef,
  HTMLAttributes,
  InputHTMLAttributes,
  LabelHTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
  useId,
} from "react"

// TODO: Add Toaster component back when needed for notifications

// Re-export clsx as clx for compatibility
export { clsx as clx }

// Text Component
type TextProps = HTMLAttributes<HTMLParagraphElement> & {
  as?: "p" | "span" | "div"
}

export const Text = forwardRef<HTMLParagraphElement, TextProps>(
  ({ className, as: Component = "p", children, ...props }, ref) => {
    return (
      <Component ref={ref} className={clsx("text-base", className)} {...props}>
        {children}
      </Component>
    )
  }
)
Text.displayName = "Text"

// Heading Component
type HeadingProps = HTMLAttributes<HTMLHeadingElement> & {
  level?: "h1" | "h2" | "h3"
}

export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(
  ({ className, level: Component = "h2", children, ...props }, ref) => {
    return (
      <Component
        ref={ref}
        className={clsx(
          "font-semibold",
          Component === "h1" && "text-3xl",
          Component === "h2" && "text-2xl",
          Component === "h3" && "text-xl",
          className
        )}
        {...props}
      >
        {children}
      </Component>
    )
  }
)
Heading.displayName = "Heading"

// Button Component
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "transparent"
  size?: "small" | "medium" | "large"
  isLoading?: boolean
  static?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "medium",
      isLoading,
      static: isStatic,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading || undefined}
        className={clsx(
          "inline-flex items-center justify-center gap-2 rounded-md font-medium touch-manipulation motion-safe:transition-[background-color,color,scale] motion-safe:duration-150 motion-safe:ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50",
          !isStatic && "motion-safe:active:scale-[0.96]",
          variant === "primary" &&
            "bg-action-primary text-content-inverse hover:bg-action-primary-hover",
          variant === "secondary" &&
            "border border-line-subtle bg-surface-default text-content-primary hover:bg-surface-subtle",
          variant === "transparent" &&
            "bg-transparent text-content-primary hover:bg-surface-subtle",
          size === "small" && "min-h-10 px-3 text-sm",
          size === "medium" && "min-h-11 px-4",
          size === "large" && "min-h-12 px-6 text-lg",
          className
        )}
        {...props}
      >
        {isLoading && (
          <span
            aria-hidden="true"
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
        )}
        <span>{children}</span>
      </button>
    )
  }
)
Button.displayName = "Button"

// Container Component
type ContainerProps = HTMLAttributes<HTMLDivElement>

export const Container = forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={clsx("bg-surface-default rounded-lg p-4", className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)
Container.displayName = "Container"

// Badge Component
type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: "success" | "error" | "warning" | "info" | "neutral"
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "neutral", children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={clsx(
          "inline-flex items-center rounded-full px-2 py-1 text-xs font-medium",
          variant === "success" && "bg-success-background text-success-foreground",
          variant === "error" && "bg-error-background text-error-foreground",
          variant === "warning" && "bg-warning-background text-warning-foreground",
          variant === "info" && "bg-info-background text-info-foreground",
          variant === "neutral" && "bg-surface-subtle text-content-secondary",
          className
        )}
        {...props}
      >
        {children}
      </span>
    )
  }
)
Badge.displayName = "Badge"

// IconBadge Component
type IconBadgeProps = HTMLAttributes<HTMLSpanElement>

export const IconBadge = forwardRef<HTMLSpanElement, IconBadgeProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={clsx(
          "inline-flex items-center justify-center rounded-full bg-surface-subtle p-1",
          className
        )}
        {...props}
      >
        {children}
      </span>
    )
  }
)
IconBadge.displayName = "IconBadge"

// IconButton Component
type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  static?: boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, children, static: isStatic, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          "inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-md p-2 motion-safe:transition-[background-color,color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50",
          !isStatic && "motion-safe:active:scale-[0.96]",
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)
IconButton.displayName = "IconButton"

// Label Component
type LabelProps = LabelHTMLAttributes<HTMLLabelElement>

export const Label = forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={clsx("text-sm font-medium", className)}
        {...props}
      >
        {children}
      </label>
    )
  }
)
Label.displayName = "Label"

// Input Component
type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  error?: string
  description?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, description, ...props }, ref) => {
    const generatedId = useId()
    const inputId = props.id ?? generatedId
    const descriptionId = `${inputId}-description`
    const errorId = `${inputId}-error`
    const describedBy = [
      props["aria-describedby"],
      description ? descriptionId : undefined,
      error ? errorId : undefined,
    ]
      .filter(Boolean)
      .join(" ") || undefined

    return (
      <div className="flex flex-col gap-1">
        {label && <Label htmlFor={inputId}>{label}</Label>}
        <input
          {...props}
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : props["aria-invalid"]}
          aria-describedby={describedBy}
          className={clsx(
            "flex min-h-11 w-full rounded-md border border-line-subtle bg-surface-default px-3 py-2 text-base text-content-primary placeholder:text-content-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-error-foreground",
            className
          )}
        />
        {description && (
          <p id={descriptionId} className="text-small-regular text-ui-fg-subtle">
            {description}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-small-regular text-error-foreground">
            <span className="font-semibold">Error:</span> {error}
          </p>
        )}
      </div>
    )
  }
)
Input.displayName = "Input"

// Table Components
type TableProps = TableHTMLAttributes<HTMLTableElement>

const TableRoot = forwardRef<HTMLTableElement, TableProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <table
        ref={ref}
        className={clsx("w-full caption-bottom text-sm", className)}
        {...props}
      >
        {children}
      </table>
    )
  }
)
TableRoot.displayName = "Table"

type TableHeaderProps = HTMLAttributes<HTMLTableSectionElement>

const TableHeader = forwardRef<HTMLTableSectionElement, TableHeaderProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <thead
        ref={ref}
        className={clsx("[&_tr]:border-b", className)}
        {...props}
      >
        {children}
      </thead>
    )
  }
)
TableHeader.displayName = "TableHeader"

type TableBodyProps = HTMLAttributes<HTMLTableSectionElement>

const TableBody = forwardRef<HTMLTableSectionElement, TableBodyProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <tbody
        ref={ref}
        className={clsx("[&_tr:last-child]:border-0", className)}
        {...props}
      >
        {children}
      </tbody>
    )
  }
)
TableBody.displayName = "TableBody"

type TableRowProps = HTMLAttributes<HTMLTableRowElement>

const TableRow = forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <tr
        ref={ref}
        className={clsx(
          "border-b border-line-subtle transition-colors hover:bg-surface-subtle",
          className
        )}
        {...props}
      >
        {children}
      </tr>
    )
  }
)
TableRow.displayName = "TableRow"

type TableHeadProps = ThHTMLAttributes<HTMLTableCellElement>

const TableHead = forwardRef<HTMLTableCellElement, TableHeadProps>(
  ({ className, children, scope = "col", ...props }, ref) => {
    return (
      <th
        ref={ref}
        scope={scope}
        className={clsx(
          "h-12 px-4 text-left align-middle font-medium text-content-muted [&:has([role=checkbox])]:pr-0",
          className
        )}
        {...props}
      >
        {children}
      </th>
    )
  }
)
TableHead.displayName = "TableHead"

type TableCellProps = TdHTMLAttributes<HTMLTableCellElement>

const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <td
        ref={ref}
        className={clsx(
          "p-4 align-middle [&:has([role=checkbox])]:pr-0",
          className
        )}
        {...props}
      >
        {children}
      </td>
    )
  }
)
TableCell.displayName = "TableCell"

export const Table = Object.assign(TableRoot, {
  Header: TableHeader,
  Body: TableBody,
  Row: TableRow,
  Head: TableHead,
  HeaderCell: TableHead,
  Cell: TableCell,
})

// RadioGroup Components
type RadioGroupProps = FieldsetHTMLAttributes<HTMLFieldSetElement>

const RadioGroupRoot = forwardRef<HTMLFieldSetElement, RadioGroupProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <fieldset
        ref={ref}
        className={clsx("m-0 flex flex-col gap-2 border-0 p-0", className)}
        {...props}
      >
        {children}
      </fieldset>
    )
  }
)
RadioGroupRoot.displayName = "RadioGroup"

type RadioGroupItemProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
}

const RadioGroupItem = forwardRef<HTMLInputElement, RadioGroupItemProps>(
  ({ className, label, id, ...props }, ref) => {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={ref}
          type="radio"
          id={id}
          className={clsx(
            "h-4 w-4 border-line-subtle text-content-primary focus:ring-content-primary",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            className
          )}
          {...props}
        />
        {label && <Label htmlFor={id}>{label}</Label>}
      </div>
    )
  }
)
RadioGroupItem.displayName = "RadioGroupItem"

export const RadioGroup = Object.assign(RadioGroupRoot, {
  Item: RadioGroupItem,
})

// Checkbox Component
type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label?: string
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id, ...props }, ref) => {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={ref}
          type="checkbox"
          id={id}
          className={clsx(
            "h-4 w-4 rounded border-line-subtle text-content-primary focus:ring-content-primary",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
            className
          )}
          {...props}
        />
        {label && <Label htmlFor={id}>{label}</Label>}
      </div>
    )
  }
)
Checkbox.displayName = "Checkbox"
