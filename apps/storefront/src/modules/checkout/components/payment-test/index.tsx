import { Badge } from "@modules/common/components/ui"
import { getDictionary } from "@lib/i18n"

const PaymentTest = ({ className }: { className?: string }) => {
  const t = getDictionary().checkout

  return (
    <Badge variant="warning" className={`text-xs leading-5 ${className ?? ""}`}>
      <span className="font-semibold">{t.testPaymentTitle}</span>{" "}
      {t.testPaymentDescription}
    </Badge>
  )
}

export default PaymentTest
