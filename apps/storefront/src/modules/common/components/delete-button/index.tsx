import { deleteLineItem } from "@lib/data/cart"
import { Spinner, Trash } from "@medusajs/icons"
import { clx } from "@modules/common/components/ui"
import { useState } from "react"

const DeleteButton = ({
  id,
  children,
  className,
}: {
  id: string
  children?: React.ReactNode
  className?: string
}) => {
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
        className="flex gap-x-1 text-ui-fg-subtle hover:text-ui-fg-base cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-border-interactive focus-visible:rounded-sm disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={() => handleDelete(id)}
        disabled={isDeleting}
        aria-label={children ? undefined : "Remove item"}
      >
        {isDeleting ? <Spinner className="animate-spin" aria-hidden="true" /> : <Trash aria-hidden="true" />}
        {children && <span>{children}</span>}
      </button>
    </div>
  )
}

export default DeleteButton
