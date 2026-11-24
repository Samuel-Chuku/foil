import { errorMessage } from '../cloud/errors'
import { NeedsConsent } from './useDevice'

// An error in words for the vendor. A missing model points at the choice the
// panel shows above.
export function errorText(error: unknown): string {
  if (error instanceof NeedsConsent) {
    return `${error.message} Choose above how to go on.`
  }
  return errorMessage(error, navigator.onLine)
}
