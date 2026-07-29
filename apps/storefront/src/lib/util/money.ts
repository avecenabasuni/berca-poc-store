import { isEmpty } from "./isEmpty"

type ConvertToLocaleParams = {
  amount: number
  currency_code: string
  minimumFractionDigits?: number
  maximumFractionDigits?: number
  locale?: string
}

export const convertToLocale = ({
  amount,
  currency_code,
  minimumFractionDigits,
  maximumFractionDigits,
  locale,
}: ConvertToLocaleParams) => {
  const isIDR = currency_code?.toLowerCase() === "idr"
  const targetLocale = isIDR ? "id-ID" : (locale || "en-US")
  
  // For IDR currency, default to 0 decimal places (e.g. Rp 150.000)
  const minDecimals = isIDR ? (minimumFractionDigits ?? 0) : minimumFractionDigits
  const maxDecimals = isIDR ? (maximumFractionDigits ?? 0) : maximumFractionDigits

  return currency_code && !isEmpty(currency_code)
    ? new Intl.NumberFormat(targetLocale, {
        style: "currency",
        currency: currency_code,
        minimumFractionDigits: minDecimals,
        maximumFractionDigits: maxDecimals,
      }).format(amount)
    : amount.toString()
}
