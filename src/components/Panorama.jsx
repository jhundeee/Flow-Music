import React, { forwardRef, memo } from 'react';

const SECTION_ORDER = ['all', 'artists', 'albums', 'folders', 'favorites'];

const SECTION_ACCENTS = {
  all: 'var(--accent)',
  artists: 'var(--accent)',
  albums: 'var(--accent)',
  folders: 'var(--accent)',
  favorites: 'var(--accent)',
};

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
        style={{ borderLeft: `4px solid ${SECTION_ACCENTS[activeSection] || 'var(--accent-blue)'}` }}
      >
        {activeChild}
      </div>
    </div>
  );
});

export default memo(Panorama);
export { SECTION_ORDER, SECTION_ACCENTS };
