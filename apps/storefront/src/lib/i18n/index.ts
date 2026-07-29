export const idDictionary = {
  cart: {
    title: "Keranjang Belanja",
    items: "Item",
    quantity: "Jumlah",
    remove: "Hapus",
    subtotal: "Subtotal",
    viewCart: "Lihat Keranjang Belanja",
    empty: "Keranjang belanja Anda kosong.",
    explore: "Jelajahi Produk",
  },
  checkout: {
    secureTitle: "Pembayaran Aman & Terenkripsi",
    backToCart: "Kembali ke keranjang",
    summaryTitle: "Ringkasan Pesanan",
    discountCode: "Kode Diskon",
    apply: "Gunakan",
    subtotal: "Subtotal",
    shipping: "Pengiriman",
    taxes: "Pajak",
    total: "Total Pembayaran",
    shippingAddress: "Alamat Pengiriman",
    shippingMethod: "Metode Pengiriman",
    payment: "Pembayaran",
    review: "Tinjau Pesanan",
    edit: "Ubah",
  },
}

export const enDictionary = {
  cart: {
    title: "Shopping Cart",
    items: "Items",
    quantity: "Quantity",
    remove: "Remove",
    subtotal: "Subtotal",
    viewCart: "View Shopping Cart",
    empty: "Your shopping cart is empty.",
    explore: "Explore Products",
  },
  checkout: {
    secureTitle: "Secure & Encrypted Checkout",
    backToCart: "Back to shopping cart",
    summaryTitle: "Order Summary",
    discountCode: "Discount Code",
    apply: "Apply",
    subtotal: "Subtotal",
    shipping: "Shipping",
    taxes: "Taxes",
    total: "Total Payment",
    shippingAddress: "Shipping Address",
    shippingMethod: "Shipping Method",
    payment: "Payment",
    review: "Review Order",
    edit: "Edit",
  },
}

export type Dictionary = typeof idDictionary

export const getDictionary = (countryCode?: string | string[]): Dictionary => {
  const code = Array.isArray(countryCode) ? countryCode[0] : countryCode
  const isID = code?.toLowerCase() === "id"
  return isID ? idDictionary : enDictionary
}
