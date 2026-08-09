import { retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/customer"
import CartTemplate from "@modules/cart/templates"
import { Metadata } from "next"
import { notFound } from "next/navigation"

export const metadata: Metadata = {
  title: "Keranjang belanja",
  description: "Tinjau produk yang akan dibeli.",
}

export default async function Cart(props: {
  params: Promise<{ countryCode: string }>
}) {
  const { countryCode } = await props.params
  const cart = await retrieveCart(undefined, undefined, countryCode).catch((error) => {
    console.error(error)
    return notFound()
  })

  const customer = await retrieveCustomer()

  return <CartTemplate cart={cart} customer={customer} />
}
