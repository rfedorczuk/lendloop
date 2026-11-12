import { BoardPage } from "./BoardPage";

// The page waits for the session in the browser, so nothing here can be
// prerendered for an instant navigation.
export const instant = false;

export default function Page() {
  return <BoardPage />;
}
