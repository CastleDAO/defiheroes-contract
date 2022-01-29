import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";

export function generateMerkle(whiteList: string[]): MerkleTree {
  const leafNodes = whiteList.map((add) => keccak256(add));

  const merkletree = new MerkleTree(leafNodes, keccak256, { sortPairs: true });


  return merkletree;
}
