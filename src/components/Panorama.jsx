import React, { forwardRef, memo } from 'react';

const SECTION_ORDER = ['all', 'artists', 'albums', 'folders', 'favorites'];

const Panorama = forwardRef(function Panorama(
  { activeSection, children },
  ref,
) {
  const childrenArray = React.Children.toArray(children);
  const idx = SECTION_ORDER.indexOf(activeSection);
  const activeChild = idx >= 0 ? childrenArray[idx] : null;

  return (
    <div className="panorama-container">
      <div
        className="panorama-section"
      >
        {activeChild}
      </div>
    </div>
  );
});

export default memo(Panorama);
export { SECTION_ORDER };
