import { AnyAction } from '@reduxjs/toolkit';

import { toggleDub } from '@store/slices/videoSettings';
import { useDispatch, useSelector } from '@store/store';

interface TogglerProps {
  label: string;
  checked: boolean;
  action: AnyAction;
}

const Toggler: React.FC<TogglerProps> = ({ label, checked, action }) => {
  const dispatch = useDispatch();

  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-fg">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={() => dispatch(action)}
        className="peer sr-only"
      />
      <span
        className="relative h-5 w-9 flex-shrink-0 rounded-full bg-surface-2 transition-colors duration-300 after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-faint after:transition after:duration-300 peer-checked:bg-accent peer-checked:after:translate-x-4 peer-checked:after:bg-accent-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent/70"
        aria-hidden
      />
    </label>
  );
};

const WatchControls: React.FC = () => {
  const useDub = useSelector((store) => store.videoSettings.useDub);

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-line/60 bg-surface/40 p-3">
      <span className="text-sm text-muted">Player</span>
      <Toggler label="Dubbed" checked={useDub} action={toggleDub()} />
    </div>
  );
};

export default WatchControls;
