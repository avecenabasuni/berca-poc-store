import { Heading, Text } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { getDictionary } from "@lib/i18n"

const SignInPrompt = () => {
  const t = getDictionary().cart

  return (
    <div className="bg-surface-default flex items-center justify-between">
      <div>
        <Heading level="h2" className="txt-xlarge">
          {t.accountPromptTitle}
        </Heading>
        <Text className="txt-medium text-ui-fg-subtle mt-2">
          {t.accountPromptDescription}
        </Text>
      </div>
      <div>
        <LocalizedClientLink
          href="/account"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-line-control bg-surface-default px-4 font-medium text-content-primary motion-safe:transition-[background-color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-[0.96]"
          data-testid="sign-in-button"
        >
          {t.signIn}
        </LocalizedClientLink>
      </div>
    </div>
  )
}

export default SignInPrompt
