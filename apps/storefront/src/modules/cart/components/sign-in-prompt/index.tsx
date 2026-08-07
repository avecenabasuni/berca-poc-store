import { Heading, Text } from "@modules/common/components/ui"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const SignInPrompt = () => {
  return (
    <div className="bg-surface-default flex items-center justify-between">
      <div>
        <Heading level="h2" className="txt-xlarge">
          Already have an account?
        </Heading>
        <Text className="txt-medium text-ui-fg-subtle mt-2">
          Sign in for a better experience.
        </Text>
      </div>
      <div>
        <LocalizedClientLink
          href="/account"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-line-subtle bg-surface-default px-4 font-medium text-content-primary motion-safe:transition-[background-color,scale] motion-safe:duration-150 motion-safe:ease-out hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-safe:active:scale-[0.96]"
          data-testid="sign-in-button"
        >
          Sign in
        </LocalizedClientLink>
      </div>
    </div>
  )
}

export default SignInPrompt
