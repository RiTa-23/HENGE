import { PracticeMark } from "@/components/ModeMark";
import { HandFigure } from "@/components/play/FingerGuide";
import { type Finger, type FingerName, type Hand } from "@/lib/play/fingers";
import { fingerTint, MiniKeyboard } from "./MiniKeyboard";

/**
 * 「最適化とは？」の動かない図。文字だけでは伝わりにくいところを、
 * HENGE の画面と同じ部品・同じ塗り（押すキーと指は橙、装飾は金の線まで）で描く。
 */

/** 図の枠。金は線までに留める（docs/07-ui.md「配色」） */
function Figure({ caption, children }: { caption: React.ReactNode; children: React.ReactNode }) {
  return (
    <figure className="rounded border border-kin/40 px-4 py-6 sm:px-6">
      {children}
      <figcaption className="mt-5 text-center text-xs leading-relaxed text-kinari/50">
        {caption}
      </figcaption>
    </figure>
  );
}

/** 手の図の指の並び（左手は小指から）。高さは手の図（`HandFigure`）と同じ見当 */
const HAND_FINGERS: { finger: Exclude<FingerName, "thumb">; height: string }[] = [
  { finger: "pinky", height: "h-7" },
  { finger: "ring", height: "h-10" },
  { finger: "middle", height: "h-11" },
  { finger: "index", height: "h-10" },
];

/** 指の塗りを手の形で見せる。キーと同じ色なので、キーの色から指が辿れる */
function TintedHand({ hand }: { hand: Hand }) {
  const fingers = hand === "left" ? HAND_FINGERS : HAND_FINGERS.toReversed();
  return (
    <div className="flex flex-col items-center">
      <div className="flex items-end gap-1">
        {fingers.map(({ finger, height }) => (
          <span
            key={finger}
            className={`w-5 rounded-t-full border ${height} ${fingerTint({ hand, finger })}`}
          />
        ))}
      </div>
      <span className="mt-1 h-2 self-stretch rounded-b-lg border border-kinari/15 bg-kinari/5" />
      <span className="mt-2 text-[11px] tracking-widest text-kinari/50">
        {hand === "left" ? "左手" : "右手"}
      </span>
    </div>
  );
}

/** 塗りと指の名前の対応。人差し指だけ左右で色が違うので、左右を書き分ける */
const LEGEND: { finger: Finger; label: string }[] = [
  { finger: { hand: "left", finger: "index" }, label: "左の人差し指" },
  { finger: { hand: "right", finger: "index" }, label: "右の人差し指" },
  { finger: { hand: "left", finger: "middle" }, label: "中指" },
  { finger: { hand: "left", finger: "ring" }, label: "薬指" },
  { finger: { hand: "left", finger: "pinky" }, label: "小指" },
];

function FingerLegend() {
  return (
    <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-xs text-kinari/70">
      {LEGEND.map(({ finger, label }) => (
        <li key={label} className="flex items-center gap-1.5">
          <span className={`h-3.5 w-3.5 rounded-sm border ${fingerTint(finger)}`} />
          {label}
        </li>
      ))}
    </ul>
  );
}

/** 標準運指。キーを受け持つ指ごとに塗り、例に使う I・K の列を縁取る */
export function StandardFingeringFigure() {
  return (
    <Figure
      caption={
        <>
          <span className="text-daidai">縁取った列</span>
          （I・K）は、どちらも右の中指。下線は人差し指を置く F・J
        </>
      }
    >
      <div className="flex justify-center">
        <MiniKeyboard tinted states={{ I: "ring", K: "ring" }} />
      </div>
      <div className="mt-6 flex items-end justify-center gap-10 sm:gap-16">
        <TintedHand hand="left" />
        <TintedHand hand="right" />
      </div>
      <div className="mt-5">
        <FingerLegend />
      </div>
    </Figure>
  );
}

interface Bar {
  /** 始まりと終わり（拍） */
  from: number;
  to: number;
  label: string;
  kind: "press" | "move";
}

/** タイムラインの全長（拍）。最後に余白を残す */
const SPAN = 3.4;

function Lane({ name, bars }: { name: string; bars: Bar[] }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-right text-[11px] tracking-wider text-kinari/50">
        {name}
      </span>
      <div className="relative h-7 flex-1">
        {bars.map((bar) => (
          <span
            key={`${bar.from}-${bar.label}`}
            className={`absolute inset-y-0 flex items-center justify-center rounded text-[11px] ${
              bar.kind === "press"
                ? "bg-daidai font-mono font-bold text-sumi"
                : "border border-dashed border-kinari/30 text-kinari/50"
            }`}
            style={{
              left: `${(bar.from / SPAN) * 100}%`,
              width: `calc(${((bar.to - bar.from) / SPAN) * 100}% - 2px)`,
            }}
          >
            {bar.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** 打ち終わりの位置の印。2つの打ち方の差をそろえて見せる。狭い画面ではみ出さないよう、文言は印の左に置く */
function EndLine({ at, label }: { at: number; label: string }) {
  return (
    <div className="flex gap-3">
      <span className="w-20 shrink-0" />
      <div className="relative h-5 flex-1">
        <span
          className="absolute top-0 -translate-x-full pr-px text-[10px] whitespace-nowrap text-kinari/50"
          style={{ left: `${(at / SPAN) * 100}%` }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

/**
 * 同じ指が続くと遅くなる理由。**別の指なら「押す」と「次へ動く」が重なり、
 * 同じ指だと直列になる**ことを、打鍵の時間の帯で見せる。
 */
export function SameFingerTimelineFigure() {
  return (
    <Figure
      caption={
        <>
          <span className="text-daidai">橙</span>は押している時間、破線は指を次のキーへ動かす時間。
          別の指なら、押している間に次の指が動ける
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-xs tracking-widest text-kin">別の指で「き」</p>
          <div className="space-y-1.5">
            <Lane name="右 人差し指" bars={[{ from: 0, to: 1, label: "K", kind: "press" }]} />
            <Lane
              name="右 中指"
              bars={[
                { from: 0, to: 1, label: "I へ", kind: "move" },
                { from: 1, to: 2, label: "I", kind: "press" },
              ]}
            />
          </div>
          <EndLine at={2} label="打ち終わり ▲" />
        </div>
        <div>
          <p className="mb-2 text-xs tracking-widest text-kinari/60">同じ指で「き」</p>
          <div className="space-y-1.5">
            <Lane
              name="右 中指"
              bars={[
                { from: 0, to: 1, label: "K", kind: "press" },
                { from: 1, to: 2, label: "I へ", kind: "move" },
                { from: 2, to: 3, label: "I", kind: "press" },
              ]}
            />
          </div>
          <EndLine at={3} label="動かす分だけ遅い　打ち終わり ▲" />
        </div>
      </div>
    </Figure>
  );
}

function KeyCaps({ keys }: { keys: string }) {
  return (
    <span className="flex gap-1">
      {[...keys].map((key, index) => (
        <span
          key={index}
          className="flex h-7 w-6 items-center justify-center rounded border border-kinari/15 bg-kinari/5 font-mono text-xs text-kinari/80"
        >
          {key}
        </span>
      ))}
    </span>
  );
}

/** 打ち方の分岐。1つの音に打ち方がいくつもあることを、枝分かれで見せる */
export function RomanBranchFigure() {
  const branches = [
    { kana: "ふ", ways: ["FU", "HU"] },
    { kana: "ち", ways: ["TI", "CHI"] },
  ];
  return (
    <Figure
      caption={
        <>
          1つの音に、打ち方はいくつもある。「ふ」を HU で打つと H・U とも右の人差し指が続くが、 FU
          なら F は左手で打てる
        </>
      }
    >
      <div className="flex flex-wrap justify-center gap-x-12 gap-y-6">
        {branches.map(({ kana, ways }) => (
          <div key={kana} className="flex items-center gap-4">
            <span className="font-mincho text-3xl text-kinari">{kana}</span>
            <ul className="space-y-2 border-l border-kin/50 pl-4">
              {ways.map((way) => (
                <li key={way} className="flex items-center gap-3">
                  <KeyCaps keys={way} />
                  <span className="text-[11px] text-kinari/50">{way.length}打</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Figure>
  );
}

/** 文の中で、最適化する音（き）に金の下線を引く */
function Sentence({ text, faded = false }: { text: string; faded?: boolean }) {
  return (
    <p
      className={`font-mincho text-base tracking-widest ${faded ? "text-kinari/40" : "text-kinari"}`}
    >
      {[...text].map((char, index) =>
        char === "き" ? (
          <span key={index} className="border-b-2 border-kin text-kin">
            {char}
          </span>
        ) : (
          <span key={index}>{char}</span>
        ),
      )}
    </p>
  );
}

/**
 * 反復の仕方。同じ文の繰り返しは文ごと覚えてしまうが、毎回違う文なら
 * 「き」の指の運びだけが残る。HENGE がお題を毎回作る理由そのもの
 */
export function RepetitionFigure() {
  return (
    <Figure caption="同じ文を繰り返すと、文の流れごと覚えてしまう。毎回違う文なら、その音の指の運びだけが残る">
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-xs tracking-widest text-kinari/50">同じ文を繰り返す</p>
          <div className="mt-3 space-y-2">
            <Sentence text="きのうはげんきだった" faded />
            <Sentence text="きのうはげんきだった" faded />
            <Sentence text="きのうはげんきだった" faded />
          </div>
        </div>
        <div>
          <p className="text-xs tracking-widest text-kin">HENGE：毎回違う文</p>
          <div className="mt-3 space-y-2">
            <Sentence text="きのうはげんきだった" />
            <Sentence text="すきなきせつはあき" />
            <Sentence text="てんきよほうをきく" />
          </div>
        </div>
      </div>
    </Figure>
  );
}

/** HENGE での練習の流れ（音を選ぶ → 運指を決める → 打つ） */
export function PracticeFlowFigure() {
  const steps = [
    {
      title: "音を選ぶ",
      body: "「き」「で」「ざ」など",
      picture: <PracticeMark className="h-12 w-12 text-kin" />,
    },
    {
      title: "運指を決める",
      body: "打ち方と指を手の図から",
      picture: <HandFigure hand="right" press={{ hand: "right", finger: "index" }} />,
    },
    {
      title: "打つ",
      body: "その音を含む、毎回違う文",
      picture: (
        <span className="flex gap-1.5 font-mono text-base">
          <span className="flex h-11 w-10 items-center justify-center rounded-md border border-daidai bg-daidai font-bold text-sumi">
            K
          </span>
          <span className="flex h-11 w-10 items-center justify-center rounded-md border border-daidai text-daidai">
            I
          </span>
        </span>
      ),
    },
  ];
  return (
    <ol className="grid gap-4 sm:grid-cols-3">
      {steps.map((step, index) => (
        <li
          key={step.title}
          className="flex flex-col items-center rounded border border-kin/40 px-3 py-5 text-center"
        >
          <span className="text-xs tracking-widest text-kin">{index + 1}</span>
          <div className="mt-3 flex h-16 items-center justify-center">{step.picture}</div>
          <p className="mt-3 font-mincho text-lg text-kinari">{step.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-kinari/60">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}
