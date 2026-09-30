/** A timeout is an unknown external result, never proof that the provider did nothing. */
export function withDeadline<T>(
  work: Promise<T>,
  milliseconds: number,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("external_operation_unconfirmed")),
      milliseconds,
    );
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
