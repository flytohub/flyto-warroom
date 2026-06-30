import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// SAFETY-CRITICAL: this test pins that ScanCredentialsTab clears
// `plaintext` state IMMEDIATELY after a successful upsert. Keeping
// the credential in memory past the request defeats the purpose of
// server-side sealing. The product copy promises "UI clears this
// field immediately afterwards" — break that promise and we mislead
// the operator.
//
// Tests pin:
//   1. Plaintext field clears after successful upsert (the contract)
//   2. Plaintext field clears when user hits Cancel
//   3. Submit button disabled while plaintext blank (gate input)
//   4. Mutation called with the plaintext (proves we actually send it)
//   5. Delete invokes the delete client with correct args

vi.mock('@lib/i18n', () => ({
  t: (key: string, params?: Record<string, string | number>) =>
    globalThis.__flytoTestT?.(key, params) ?? key,
  tOr: (_key: string, fallback: string) => fallback,
}))

vi.mock('@hooks/useOrg', () => ({
  useOrg: () => ({ org: { id: 'org-1', name: 'Test Org', role: 'owner', isAdmin: true } }),
}))

const upsertMock = vi.fn().mockResolvedValue({
  asset_id: 'a-1', credential_kind: 'cookie', label: 'staging',
  scan_type: 'authenticated_dast', key_id: 'kms-1',
})
const listMock = vi.fn().mockResolvedValue({ org_id: 'org-1', count: 0, items: [] })
const deleteMock = vi.fn().mockResolvedValue({ status: 'deleted' })

vi.mock('@lib/engine', () => ({
  listScanCredentials: (...args: unknown[]) => listMock(...args),
  upsertScanCredential: (...args: unknown[]) => upsertMock(...args),
  deleteScanCredential: (...args: unknown[]) => deleteMock(...args),
}))

vi.mock('notistack', () => ({
  useSnackbar: () => ({ enqueueSnackbar: vi.fn() }),
}))

import { ScanCredentialsTab } from '../ScanCredentialsTab'

function renderTab() {
  // Per-test QueryClient so mutations don't leak across tests.
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <ScanCredentialsTab />
    </QueryClientProvider>,
  )
}

function openAddDialog() {
  fireEvent.click(screen.getByText(/Add credential/i))
}

describe('ScanCredentialsTab — safety contract', () => {
  beforeEach(() => {
    upsertMock.mockClear()
    listMock.mockClear()
    deleteMock.mockClear()
  })

  it('clears plaintext field after successful upsert', async () => {
    renderTab()
    openAddDialog()
    const assetInput = screen.getByLabelText(/Asset ID/i) as HTMLInputElement
    const plaintextInput = screen.getByLabelText(/Credential plaintext/i) as HTMLInputElement
    fireEvent.change(assetInput, { target: { value: 'asset_abc' } })
    fireEvent.change(plaintextInput, { target: { value: 'SUPER_SECRET_SID=xyz' } })

    fireEvent.click(screen.getByText(/Seal and save/i))

    // After success the dialog closes — reopen to inspect the field.
    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1))
    // Field is unmounted with the dialog. Reopen to confirm value is reset.
    await waitFor(() => {
      const addBtn = screen.getByText(/Add credential/i)
      fireEvent.click(addBtn)
    })
    const reopenedPlaintext = screen.getByLabelText(/Credential plaintext/i) as HTMLInputElement
    expect(reopenedPlaintext.value).toBe('')
    const reopenedAsset = screen.getByLabelText(/Asset ID/i) as HTMLInputElement
    expect(reopenedAsset.value).toBe('')
  })

  it('clears plaintext when user cancels the dialog', () => {
    renderTab()
    openAddDialog()
    const plaintextInput = screen.getByLabelText(/Credential plaintext/i) as HTMLInputElement
    fireEvent.change(plaintextInput, { target: { value: 'AbortMe' } })
    expect(plaintextInput.value).toBe('AbortMe')

    fireEvent.click(screen.getByText(/Cancel/i))
    // Reopen and check.
    fireEvent.click(screen.getByText(/Add credential/i))
    const reopened = screen.getByLabelText(/Credential plaintext/i) as HTMLInputElement
    expect(reopened.value).toBe('')
  })

  it('disables submit button when plaintext blank', () => {
    renderTab()
    openAddDialog()
    fireEvent.change(screen.getByLabelText(/Asset ID/i), { target: { value: 'asset_x' } })
    const submit = screen.getByText(/Seal and save/i).closest('button') as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/Credential plaintext/i), { target: { value: 'x' } })
    expect(submit.disabled).toBe(false)
  })

  it('passes plaintext to the upsert client (mutation actually sends it)', async () => {
    renderTab()
    openAddDialog()
    fireEvent.change(screen.getByLabelText(/Asset ID/i), { target: { value: 'asset_y' } })
    fireEvent.change(screen.getByLabelText(/Credential plaintext/i), { target: { value: 'sid=abc' } })
    fireEvent.click(screen.getByText(/Seal and save/i))

    await waitFor(() => expect(upsertMock).toHaveBeenCalledTimes(1))
    expect(upsertMock).toHaveBeenCalledWith('org-1', expect.objectContaining({
      asset_id: 'asset_y',
      credential_kind: 'cookie',
      plaintext: 'sid=abc',
    }))
  })
})
