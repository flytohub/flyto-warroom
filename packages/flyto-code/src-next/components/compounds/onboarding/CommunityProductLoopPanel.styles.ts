import { styled } from '@mui/material/styles'
import Typography from '@mui/material/Typography'

export const LoopRoot = styled('section')`
  padding: 20px;
  border: 1px solid var(--mui-palette-divider);
  border-radius: 8px;
  background: var(--mui-palette-background-paper);

  @media (max-width: 599px) {
    padding: 16px;
  }
`

export const LoopLoading = styled(LoopRoot)`
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 16px;
`

export const LoopHeader = styled('div')`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
`

export const LoopIdentity = styled('div')`
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  min-width: 0;
`

export const LoopIcon = styled('span')`
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  flex: 0 0 34px;
  border-radius: 8px;
  color: var(--mui-palette-success-contrastText);
  background: var(--mui-palette-success-main);
`

export const LoopCopy = styled('div')`
  min-width: 0;
`

export const LoopDescription = styled(Typography)`
  max-width: 760px;
  margin-top: 4px;
`

export const LoopSurfaces = styled('div')`
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin-top: 16px;
  flex-wrap: wrap;
`

export const LoopMetrics = styled('div')`
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  margin-top: 16px;
  overflow: hidden;
  border: 1px solid var(--mui-palette-divider);
  border-radius: 8px;

  @media (max-width: 899px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @media (max-width: 599px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`

export const LoopMetric = styled('div')`
  min-width: 0;
  padding: 12px;
  border-right: 1px solid var(--mui-palette-divider);

  &:last-child {
    border-right: 0;
  }

  @media (max-width: 899px) {
    &:nth-child(3n) {
      border-right: 0;
    }

    &:nth-child(-n + 3) {
      border-bottom: 1px solid var(--mui-palette-divider);
    }
  }

  @media (max-width: 599px) {
    &:nth-child(3n) {
      border-right: 1px solid var(--mui-palette-divider);
    }

    &:nth-child(2n) {
      border-right: 0;
    }

    &:nth-child(-n + 4) {
      border-bottom: 1px solid var(--mui-palette-divider);
    }
  }
`

export const LoopActions = styled('div')`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 16px;
  flex-wrap: wrap;
`

export const LoopSafeMode = styled('div')`
  display: flex;
  align-items: center;
  gap: 0.375rem;
`

export const LoopDetails = styled('div')`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--mui-palette-divider);

  @media (max-width: 899px) {
    grid-template-columns: 1fr;
  }
`

export const LoopList = styled('ul')`
  margin: 8px 0 0;
  padding-left: 20px;

  li + li {
    margin-top: 6px;
  }
`
