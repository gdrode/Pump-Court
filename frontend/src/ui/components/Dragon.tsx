export type DragonAction = 'idle' | 'curl' | 'wave' | 'cheer' | 'sad' | 'hype' | 'hurry';

interface Props {
  /** What the dragon is doing. Each action is a CSS animation in styles.css (".dragon--<action>"). */
  action?: DragonAction;
  /** Change this to replay a one-shot action, e.g. pass the rep count so every rep gets a new jump. */
  beat?: number | string;
  /** What the dragon says. A new line re-plays the bubble pop. */
  says?: string;
  mood?: 'good' | 'bad';
  size?: 'sm' | 'md' | 'lg';
  /** Which side the bubble sits on. */
  bubble?: 'right' | 'left' | 'top';
  className?: string;
}

/** The host: an animated, hand-drawn dragon with a speech bubble. */
export function Dragon({ action = 'idle', beat, says, mood, size = 'md', bubble = 'right', className = '' }: Props) {
  return (
    <div className={`host host--${size} host--bubble-${bubble} ${className}`}>
      <DragonArt action={action} key={`${action}-${beat ?? ''}`} />
      {says && (
        <p className={`host__bubble sketch ${mood ? `is-${mood}` : ''}`} key={says} aria-live="polite">
          {says}
        </p>
      )}
    </div>
  );
}

const INK = '#241f1a';
const GREEN = '#5bb25a';
const GREEN_DARK = '#3d8a3f';
const CREAM = '#f6e3a6';
const HORN = '#f1dc9c';
const CHEEK = '#f3a3a0';
const EYE = '#5a2a1a';
const BAND = '#6b3fd4'; // Knight Hacks purple (--purple in tokens.css)

/** Expressions: which face goes with which action. */
const FACE: Record<DragonAction, 'happy' | 'sad' | 'grit'> = {
  idle: 'happy',
  wave: 'happy',
  cheer: 'happy',
  hype: 'happy',
  curl: 'grit',
  hurry: 'grit',
  sad: 'sad',
};

function DragonArt({ action }: { action: DragonAction }) {
  const face = FACE[action];
  const s = { stroke: INK, strokeWidth: 3.5, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };

  return (
    <svg className={`dragon dragon--${action}`} viewBox="0 0 240 250" role="img" aria-label="The Pump Court dragon">
      {/* paint splat behind, for an art-print feel */}
      <path
        className="d-splat"
        d="M120 40 C160 30 205 55 208 100 C212 140 225 170 200 205 C178 236 120 238 82 226 C40 214 22 180 28 140 C32 110 18 80 46 58 C70 40 92 46 120 40 Z"
      />

      {/* motion doodles */}
      <g className="d-fx d-burst" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round">
        <path d="M40 60 L24 48" />
        <path d="M30 96 L10 92" />
        <path d="M200 60 L216 48" />
        <path d="M210 96 L230 92" />
        <path d="M120 10 L120 -6" />
      </g>
      <g className="d-fx d-sparkles" fill={CREAM} stroke={INK} strokeWidth="2.5" strokeLinejoin="round">
        <path className="spark spark--1" d="M30 50 L34 62 L46 66 L34 70 L30 82 L26 70 L14 66 L26 62 Z" />
        <path className="spark spark--2" d="M208 40 L211 49 L220 52 L211 55 L208 64 L205 55 L196 52 L205 49 Z" />
        <path className="spark spark--3" d="M214 150 L217 159 L226 162 L217 165 L214 174 L211 165 L202 162 L211 159 Z" />
      </g>

      <ellipse className="d-shadow" cx="120" cy="238" rx="52" ry="7" />

      <g className="d-all">
        <g filter="url(#rough-sm)">
          {/* tail */}
          <g className="d-tail">
            <path d="M150 204 C186 214 210 192 206 164 C203 146 188 140 180 152 C190 164 186 186 166 190 C156 192 150 194 146 190 Z" fill={GREEN} {...s} />
            <path d="M156 199 C182 204 198 188 197 168" fill="none" stroke={CREAM} strokeWidth="5" strokeLinecap="round" />
          </g>

          {/* wings */}
          <g className="d-wing d-wing--l">
            <path d="M84 136 C62 118 44 120 40 132 C49 132 51 139 48 146 C57 144 61 151 58 158 C67 153 76 155 80 160 Z" fill={CREAM} {...s} />
          </g>
          <g className="d-wing d-wing--r">
            <path d="M156 136 C178 118 196 120 200 132 C191 132 189 139 192 146 C183 144 179 151 182 158 C173 153 164 155 160 160 Z" fill={CREAM} {...s} />
          </g>

          {/* legs */}
          <ellipse cx="97" cy="224" rx="17" ry="13" fill={GREEN} {...s} />
          <ellipse cx="143" cy="224" rx="17" ry="13" fill={GREEN} {...s} />
          <path d="M90 230 L91 236 M98 231 L98 237 M106 230 L105 236" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
          <path d="M136 230 L137 236 M144 231 L144 237 M152 230 L151 236" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />

          {/* body */}
          <g className="d-body">
            <ellipse cx="120" cy="180" rx="45" ry="47" fill={GREEN} {...s} />
            <ellipse cx="120" cy="187" rx="27" ry="35" fill={CREAM} stroke={INK} strokeWidth="2.5" />
            <path d="M98 172 Q120 178 142 172 M96 188 Q120 194 144 188 M100 204 Q120 209 140 204" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
          </g>

          {/* head */}
          <g className="d-head">
            {/* horns */}
            <path d="M84 56 C74 40 80 26 92 20 C90 33 94 44 100 50 Z" fill={HORN} {...s} />
            <path d="M156 56 C166 40 160 26 148 20 C150 33 146 44 140 50 Z" fill={HORN} {...s} />
            <path d="M113 46 L120 28 L127 46 Z" fill={HORN} {...s} />
            {/* ear fins */}
            <path d="M68 88 L46 74 L60 102 Z" fill={GREEN} {...s} />
            <path d="M172 88 L194 74 L180 102 Z" fill={GREEN} {...s} />
            <ellipse cx="120" cy="94" rx="56" ry="48" fill={GREEN} {...s} />
            <path d="M74 120 C90 136 150 136 166 120" fill="none" stroke={GREEN_DARK} strokeWidth="3" strokeLinecap="round" opacity="0.5" />

            {/* headband with flapping knot */}
            <path d="M66 74 C90 60 150 60 174 74 L172 88 C150 75 90 75 68 88 Z" fill={BAND} {...s} />
            <g className="d-knot">
              <path d="M172 80 C188 74 198 82 206 74" fill="none" stroke={INK} strokeWidth="11" strokeLinecap="round" />
              <path d="M172 80 C188 74 198 82 206 74" fill="none" stroke={BAND} strokeWidth="6" strokeLinecap="round" />
              <path d="M172 84 C186 92 192 102 202 100" fill="none" stroke={INK} strokeWidth="11" strokeLinecap="round" />
              <path d="M172 84 C186 92 192 102 202 100" fill="none" stroke={BAND} strokeWidth="6" strokeLinecap="round" />
            </g>

            {/* brows */}
            {face === 'grit' && <path d="M86 92 L104 97 M154 92 L136 97" stroke={INK} strokeWidth="4" strokeLinecap="round" />}
            {face === 'sad' && <path d="M86 98 L104 92 M154 98 L136 92" stroke={INK} strokeWidth="4" strokeLinecap="round" />}

            {/* eyes */}
            <g className="d-eyes">
              <ellipse cx="98" cy="108" rx="8.5" ry="10.5" fill={EYE} />
              <ellipse cx="142" cy="108" rx="8.5" ry="10.5" fill={EYE} />
              <circle cx="101" cy="104" r="3.2" fill="#fff" />
              <circle cx="145" cy="104" r="3.2" fill="#fff" />
            </g>
            <ellipse cx="80" cy="122" rx="9" ry="5" fill={CHEEK} />
            <ellipse cx="160" cy="122" rx="9" ry="5" fill={CHEEK} />
            <path d="M114 117 L114 119 M126 117 L126 119" stroke={INK} strokeWidth="3" strokeLinecap="round" />

            {/* mouth */}
            {face === 'happy' && (
              <g>
                <path d="M106 124 Q120 144 134 124 Z" fill={EYE} {...s} strokeWidth={3} />
                <path d="M112 133 Q120 139 128 133 Q120 129 112 133 Z" fill="#f28da0" />
              </g>
            )}
            {face === 'grit' && (
              <g>
                <path d="M105 125 L135 125 Q133 136 120 136 Q107 136 105 125 Z" fill="#fff" {...s} strokeWidth={3} />
                <path d="M113 125 L113 135 M120 125 L120 136 M127 125 L127 135" stroke={INK} strokeWidth="2" />
              </g>
            )}
            {face === 'sad' && <path d="M108 134 Q120 124 132 134" fill="none" {...s} />}
          </g>

          {/* arms, drawn over the head so raised arms stay visible */}
          <g className="d-arm d-arm--l">
            <path d="M86 150 C67 150 56 173 60 188 C63 198 77 198 79 187 C81 176 89 163 90 157 Z" fill={GREEN} {...s} />
          </g>
          <g className="d-arm d-arm--r">
            <g className="d-dumbbell">
              <rect x="156" y="190" width="32" height="5" rx="2" fill="#8a8172" stroke={INK} strokeWidth="2.5" />
              <rect x="150" y="181" width="9" height="23" rx="3" fill="#4a443c" stroke={INK} strokeWidth="2.5" />
              <rect x="185" y="181" width="9" height="23" rx="3" fill="#4a443c" stroke={INK} strokeWidth="2.5" />
            </g>
            <path d="M154 150 C173 150 184 173 180 188 C177 198 163 198 161 187 C159 176 151 163 150 157 Z" fill={GREEN} {...s} />
          </g>

        </g>

        {/* sweat */}
        <g className="d-fx d-sweat" fill="#9fd3f0" stroke={INK} strokeWidth="2.5" strokeLinejoin="round">
          <path className="drop drop--1" d="M186 104 C186 104 194 114 194 119 C194 124 189 126 186 126 C183 126 178 124 178 119 C178 114 186 104 186 104 Z" />
          <path className="drop drop--2" d="M52 112 C52 112 59 121 59 125 C59 129 55 131 52 131 C49 131 45 129 45 125 C45 121 52 112 52 112 Z" />
        </g>
      </g>
    </svg>
  );
}
