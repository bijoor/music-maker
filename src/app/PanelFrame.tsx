import type { ReactNode } from 'react';
import { useStore } from '../state/store';

/** A full-width panel in the bottom area (instead of a pop-up dialog), with a Done button back to the clip editor. */
export default function PanelFrame({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const setPanel = useStore((s) => s.setPanel);
  return (
    <section className="card editor panelview" aria-label={title}>
      <div className="ehead">
        <h2>{title}</h2>
        <span className="spacer" />
        {actions}
        <button className="btn sm on" onClick={() => setPanel(null)}>Done</button>
      </div>
      <div className="pbody">{children}</div>
    </section>
  );
}
