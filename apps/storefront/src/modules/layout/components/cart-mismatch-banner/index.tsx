"use client"

import { transferCart } from "@lib/data/customer"
import { ExclamationCircleSolid } from "@medusajs/icons"
import { StoreCart, StoreCustomer } from "@medusajs/types"
import { Button } from "@modules/common/components/ui"
import { useState } from "react"
function CartMismatchBanner(props: {
  customer: StoreCustomer
  cart: StoreCart
}) {
  const { customer, cart } = props
  const [isPending, setIsPending] = useState(false)
  const [actionText, setActionText] = useState("Run transfer again")

  if (!customer || !!cart.customer_id) {
    return
  }

  const handleSubmit = async () => {
    try {
      setIsPending(true)
      setActionText("Transferring..")

      await transferCart()
    } catch {
      setActionText("Run transfer again")
      setIsPending(false)
    }
  }

  return (
    <div className="flex items-center justify-center small:p-4 p-2 text-center bg-warning-background small:gap-2 gap-1 text-sm mt-2 text-warning-foreground" role="alert">
      <div className="flex flex-col small:flex-row small:gap-2 gap-1 items-center">
        <span className="flex items-center gap-1">
          <ExclamationCircleSolid className="inline" aria-hidden="true" />
          Something went wrong when we tried to transfer your cart
        </span>

        <span>·</span>

        <Button
          variant="transparent"
          className="hover:bg-transparent active:bg-transparent focus:bg-transparent disabled:text-warning-foreground/60 text-warning-foreground p-0 bg-transparent"
          size="medium"
          disabled={isPending}
          onClick={handleSubmit}
        >
          {actionText}
        </Button>
      </div>
    </div>
  )
}

export default CartMismatchBanner
