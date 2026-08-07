import { deleteLineItem } from "@lib/data/cart"
import { Spinner, Trash } from "@medusajs/icons"
import { clx } from "@modules/common/components/ui"
import { useState } from "react"
import { getDictionary } from "@lib/i18n"

const DeleteButton = ({
  id,
  children,
  className,
  "data-testid": dataTestId,
}: {
  id: string
  children?: React.ReactNode
  className?: string
  "data-testid"?: string
}) => {
  const t = getDictionary().cart
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async (id: string) => {
    setIsDeleting(true)
    await deleteLineItem(id).catch((_err) => {
      setIsDeleting(false)
    })
  }

  return (
    <div
      className={clx(
        "flex items-center justify-between text-small-regular",
        className
      )}
    >
      <button
        className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-x-1 rounded-sm text-ui-fg-subtle hover:text-ui-fg-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-border-interactive disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => handleDelete(id)}
        disabled={isDeleting}
        aria-label={children ? undefined : t.remove}
        data-testid={dataTestId}
      >
        {isDeleting ? <Spinner className="animate-spin" aria-hidden="true" /> : <Trash aria-hidden="true" />}
        {children && <span>{children}</span>}
      </button>
    </div>
  )
}

export default DeleteButton
