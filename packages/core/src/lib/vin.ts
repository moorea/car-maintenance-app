/** VINs as North American cars carry them since 1981: 17 characters, never I, O or Q. */
const VIN = /^[A-HJ-NPR-Z0-9]{17}$/

const VALUES: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
}
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2]

/** Upper case without the spaces and dashes people type or paste between groups. */
export const normalizeVin = (input: string): string => input.replace(/[\s-]/g, '').toUpperCase()

const valueOf = (char: string) => VALUES[char] ?? Number(char)

/** The 9th character every US VIN carries, computed from the other 16. */
export const vinCheckDigit = (vin: string): string => {
  const sum = [...vin].reduce((total, char, i) => total + valueOf(char) * (WEIGHTS[i] ?? 0), 0)
  const remainder = sum % 11
  return remainder === 10 ? 'X' : String(remainder)
}

export type VinProblem = 'length' | 'characters' | 'check-digit'

/** Why a normalized VIN cannot be right, or undefined if it could be. */
export const vinProblem = (vin: string): VinProblem | undefined => {
  if (vin.length !== 17) return 'length'
  if (!VIN.test(vin)) return 'characters'
  if (vin[8] !== vinCheckDigit(vin)) return 'check-digit'
  return undefined
}
