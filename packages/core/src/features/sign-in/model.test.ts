import { describe, expect, it } from 'vitest'
import { memoryAuth } from '../../testing'
import { createSignInModel } from './model'

const setup = () => {
  const auth = memoryAuth()
  return { auth, model: createSignInModel({ auth }) }
}

describe('sign-in screen model', () => {
  it('sends a code to the typed email, tidied up, and moves to the code step', async () => {
    const { auth, model } = setup()
    model.getState().setEmail('  Owner@Example.com ')
    expect(await model.getState().submitEmail()).toBe(true)
    expect(auth.sent).toEqual(['owner@example.com'])
    expect(model.getState()).toMatchObject({
      step: 'code',
      email: 'owner@example.com',
      busy: false,
    })
  })

  it('explains an invalid email without sending anything', async () => {
    const { auth, model } = setup()
    model.getState().setEmail('not-an-email')
    expect(await model.getState().submitEmail()).toBe(false)
    expect(auth.sent).toEqual([])
    expect(model.getState().fieldError).toMatch(/email address/)
    expect(model.getState().step).toBe('email')
  })

  it('signs in with the emailed code, ignoring spaces in it', async () => {
    const { auth, model } = setup()
    const users: unknown[] = []
    auth.watchUser((u) => users.push(u))
    model.getState().setEmail('owner@example.com')
    await model.getState().submitEmail()
    model.getState().setCode('123 456')
    expect(await model.getState().submitCode()).toBe(true)
    expect(users.at(-1)).toEqual({ id: 'user-owner@example.com', email: 'owner@example.com' })
  })

  it('rejects a code that is not digits before asking the server', async () => {
    const { model } = setup()
    model.getState().setEmail('owner@example.com')
    await model.getState().submitEmail()
    model.getState().setCode('12ab')
    expect(await model.getState().submitCode()).toBe(false)
    expect(model.getState().fieldError).toMatch(/digits only/)
  })

  it('explains a wrong code and lets the owner try again', async () => {
    const { model } = setup()
    model.getState().setEmail('owner@example.com')
    await model.getState().submitEmail()
    model.getState().setCode('000000')
    expect(await model.getState().submitCode()).toBe(false)
    expect(model.getState().error).toMatch(/wrong or has expired/)
    model.getState().setCode('123456')
    expect(model.getState().error).toBeUndefined()
    expect(await model.getState().submitCode()).toBe(true)
  })

  it.each([
    ['rate-limited', /Too many attempts/],
    ['network', /connection/],
  ] as const)('explains a %s failure when sending the code', async (kind, message) => {
    const { auth, model } = setup()
    auth.failNext(kind)
    model.getState().setEmail('owner@example.com')
    expect(await model.getState().submitEmail()).toBe(false)
    expect(model.getState()).toMatchObject({ step: 'email', busy: false })
    expect(model.getState().error).toMatch(message)
  })

  it('resends a code to the same email and clears the old code', async () => {
    const { auth, model } = setup()
    model.getState().setEmail('owner@example.com')
    await model.getState().submitEmail()
    model.getState().setCode('111')
    expect(await model.getState().resend()).toBe(true)
    expect(auth.sent).toEqual(['owner@example.com', 'owner@example.com'])
    expect(model.getState()).toMatchObject({ step: 'code', code: '' })
  })

  it('goes back to fix the email', async () => {
    const { model } = setup()
    model.getState().setEmail('typo@example.com')
    await model.getState().submitEmail()
    model.getState().changeEmail()
    expect(model.getState()).toMatchObject({ step: 'email', email: 'typo@example.com', code: '' })
  })

  it('ignores a second submit while the first is in flight', async () => {
    const { auth, model } = setup()
    model.getState().setEmail('owner@example.com')
    const first = model.getState().submitEmail()
    expect(model.getState().busy).toBe(true)
    expect(await model.getState().submitEmail()).toBe(false)
    await first
    expect(auth.sent).toEqual(['owner@example.com'])
  })
})
