/** Two fixed, blurred ambient blobs behind every marketing page — static
 * position and color, the "one very slow, very soft light" from the
 * approved reference design. Never animates (that's spent elsewhere). */
export function Aura() {
  return (
    <div className="aura" aria-hidden>
      <b className="a1" />
      <b className="a2" />
    </div>
  );
}
