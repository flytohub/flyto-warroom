/**
 * ModeView — render the right surface for the current experience mode.
 *
 * The single seam every dual-mode page uses. Keeps existing engineer
 * UI intact (pass it as `engineer`) and layers a manager surface on
 * top (pass it as `manager`) without forking routes.
 *
 *   <ModeView
 *     manager={<XManagerView/>}
 *     engineer={<XEngineerView/>}  // = today's existing content
 *   />
 *
 * A subtle fade/slide transition runs between modes via motion.
 */

import { type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useExperience } from '@/contexts/ExperienceContext'

export interface ModeViewProps {
  manager: ReactNode
  engineer: ReactNode
  /** Disable the motion transition (e.g. inside virtualized lists). */
  noAnimate?: boolean
}

export function ModeView({ manager, engineer, noAnimate }: ModeViewProps) {
  const { mode } = useExperience()
  const content = mode === 'manager' ? manager : engineer

  if (noAnimate) return <>{content}</>

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={mode}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        style={{ height: '100%', minHeight: 0 }}
      >
        {content}
      </motion.div>
    </AnimatePresence>
  )
}
