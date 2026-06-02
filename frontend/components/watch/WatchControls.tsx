import { AnyAction } from '@reduxjs/toolkit';

import { setProvider, toggleDub } from '@store/slices/videoSettings';
import { useDispatch, useSelector } from '@store/store';
import { embedProviders } from '@utility/embedProviders';

interface TogglerProps {
  label: string;
  checked: boolean;
  action: AnyAction;
}

const Toggler: React.FC<TogglerProps> = ({ label, checked, action }) => {
  const dispatch = useDispatch();

  return (
    <label className="p2 relative mr-2 flex items-center justify-between text-white">
      {label}
      <input
        type="checkbox"
        checked={checked}
        onChange={() => dispatch(action)}
        className="peer absolute left-0 top-0 h-full w-full appearance-none"
      />
      <span
        className={`
                  ml-2 flex h-5 w-9 flex-shrink-0 items-center
                  rounded-full bg-gray-300 p-1
                  after:h-4 after:w-4 after:rounded-full after:bg-gray-500 after:shadow-lg
                  after:duration-300 peer-checked:bg-red-500 peer-checked:after:translate-x-3 peer-checked:after:bg-gray-800
                `}
      />
    </label>
  );
};

const WatchControls: React.FC = () => {
  const dispatch = useDispatch();
  const provider = useSelector((store) => store.videoSettings.provider);
  const useDub = useSelector((store) => store.videoSettings.useDub);

  return (
    <div className="m-2 flex flex-wrap items-center gap-x-4 gap-y-2">
      <Toggler label="Watch Dubbed?" checked={useDub} action={toggleDub()} />

      <label className="flex items-center text-white">
        Player:
        <select
          value={provider}
          onChange={(e) => dispatch(setProvider(e.target.value))}
          className="ml-2 rounded bg-gray-700 px-2 py-1 text-sm text-white outline-none"
        >
          {embedProviders.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};

export default WatchControls;
