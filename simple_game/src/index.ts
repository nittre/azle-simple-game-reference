import {
  nat64,
  Record,
  Vec,
  Principal,
  nat16,
  text,
  bool,
  Canister,
  update,
  query,
  ic,
  float64,
} from "azle";

import TokenCanister from "../../token/src";

const RETRY_RATE = 100;

// 캐릭터 타입 정의
export const Character = Record({
  owner: text,
  retryCount: nat64,
  battleHistory: Vec(text),
});

export const CharacterInBattle = Record({
  owner: text,
  result: float64,
  approved: bool,
  gameResults: Vec(float64),
});

// 배틀 타입 정의
export const Battle = Record({
  id: text,
  characters: Vec(Character),
  betAmount: nat64,
  maxParticipantAmount: nat16,
  results: Vec(CharacterInBattle),
  battleAdmin: text,
  winner: CharacterInBattle,
});

export const BattleInfo = Record({
  id: text,
  characters: Vec(Character),
  betAmount: nat64,
  maxParticipantAmount: nat16,
  results: Vec(CharacterInBattle),
  battleAdmin: text,
});

const characters: Vec<typeof Character> = [];
const battles: Vec<typeof Battle> = [];
let tokenOwner = ""; // 토큰 오너 주소
let tokenCanister: typeof TokenCanister;

async function _burn(from: string, amount: nat64): Promise<boolean> {
  return await ic.call(tokenCanister.burn, {
    args: [from, amount],
  });
}

async function _allowanceFrom(owner: string): Promise<bigint> {
  return await ic.call(tokenCanister.allowanceFrom, {
    args: [owner],
  });
}

async function _transferFrom(
  from: string,
  to: string,
  amount: nat64
): Promise<boolean> {
  return await ic.call(tokenCanister.transferFrom, {
    args: [from, to, amount],
  });
}

function getCaller(): string {
  const caller = ic.caller().toString();
  if (caller === null) {
    throw new Error("Caller is null");
  }
  return caller;
}

function _getCharacterByOwner(owner: string): typeof Character {
  const character = characters.find((char) => char.owner === owner);
  if (!character) {
    throw new Error("no character found");
  }
  return character;
}

function _getBattleByUuid(uuid: string): typeof Battle {
  const index = battles.findIndex((battle) => battle.id === uuid);
  if (index === -1) {
    throw new Error("no battle found");
  }
  return battles[index];
}

function getRandomNumber(): nat16 {
  return Math.random();
}

function generateRandomUUID(): string {
  const hexChars = "0123456789abcdef";
  let uuid = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";

  uuid = uuid.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return hexChars[v];
  });

  return uuid;
}

export default Canister({
  initialize: update([text], bool, (tokenCanisterAddress) => {
    tokenCanister = TokenCanister(Principal.fromText(tokenCanisterAddress));
    return true;
  }),
  getCharacterByOwner: query([text], Character, (owner) => {
    return _getCharacterByOwner(owner);
  }),
  createCharacter: update([], bool, () => {
    const newCharacter: typeof Character = {
      owner: getCaller(),
      retryCount: 1n,
      battleHistory: [],
    };

    characters.push(newCharacter);
    return true;
  }),
  upgradeRetryCountWithTokens: update([nat16], bool, async (amount) => {
    /*
          사용자는 토큰을 소모해 RetryCount를 업그레이드 할 수 있다.
          사용자는 업그레이드 할 양을 캐니스터에 approve해두어야 한다.
      */
    const caller = getCaller();
    const character = characters.find((char) => char.owner === caller);

    if (!character) {
      throw new Error("Character not found");
    }

    if (amount < RETRY_RATE) {
      throw new Error(`Amount must be bigger than ${RETRY_RATE}`);
    }

    // 1. amount를 RETRY_RATE로 나눈 나머지 값은 버리고, 몫만 취한다.
    // 1-1. 이때, 사용자가 소모할 토큰의 양은 tokenAmountToSpend (amount - 나머지)
    const tokenAmountToSpend = Math.floor(amount / RETRY_RATE) * RETRY_RATE;

    // 1-2. 업그레이드 될 RetryCount의 양은 retryCountAmountToUpgrade (몫)
    const retryCountAmountToUpgrade = Math.floor(amount / RETRY_RATE);

    // 2. tokenAmountToSpend만큼의 토큰을 burn 한다.
    // burn(사용자, amount)
    const burnCallResult = await _burn(caller, BigInt(tokenAmountToSpend));

    // 3. retryCountAmountToUpgrade만큼 캐릭터를 upgrade한다.
    if (burnCallResult) {
      const indexToModify = characters.findIndex(
        (char) => char.owner == character.owner
      );
      if (indexToModify !== -1) {
        characters[indexToModify].retryCount += BigInt(
          retryCountAmountToUpgrade
        );
      }
      return true;
    } else {
      return false;
    }
  }),
  createBattle: update(
    [nat64, nat16],
    bool,
    async (betAmount, maxParticipantAmount) => {
      /* createBattle: 배틀 생성 함수
       * 사용자는 이 함수를 호출해 새로운 배틀을 생성한다.
       * 사용자는 방장이 되어, 배틀을 실행할 권한을 가진다.
       * 배틀을 생성할 때, 배틀에 걸릴 토큰의 수를 정한다.
       * 사용자는 해당 함수를 호출하기 전에 betAmount 이상의 토큰을 컨트랙트에 approve 해두어야 한다.
       */
      const caller = getCaller();
      const callerCharacter = characters.find((char) => char.owner === caller);

      if (!callerCharacter) {
        throw new Error("Character not found");
      }

      // 1. 사용자가 BetAmount만큼 approve 해두었는지 확인
      const allowance = await _allowanceFrom(caller);
      if (allowance < betAmount) {
        throw new Error("Not enough allowance");
      }

      // 2. 배틀 생성
      const newBattle: typeof Battle = {
        id: generateRandomUUID(),
        characters: [callerCharacter],
        results: [],
        betAmount: betAmount,
        battleAdmin: caller,
        maxParticipantAmount: maxParticipantAmount,
        winner: {
          owner: "0",
          result: 0,
          approved: false,
          gameResults: [],
        },
      };

      battles.push(newBattle);

      return true;
    }
  ),
  openedBattles: query([], Vec(Battle), () => {
    return battles.filter((battle) => battle.winner.owner === "0");
  }),
  getBattleByUuid: query([text], Battle, (uuid) => {
    return _getBattleByUuid(uuid);
  }),
  enterBattle: update([text], bool, async (battleId) => {
    /*
        입장하는 참여자는 미리 토큰을 approve 해두어야 한다.
      */
    const caller = getCaller();
    const character = characters.find((char) => char.owner === caller);

    if (!character) {
      throw new Error("Character not found");
    }

    const battle = _getBattleByUuid(battleId);

    if (battle.maxParticipantAmount <= battle.characters.length) {
      throw new Error("battle is full");
    }

    const allowance = await _allowanceFrom(caller);

    if (allowance < battle.betAmount) {
      throw new Error("Not enough allowance");
    }

    battle.characters.push(character);

    return true;
  }),

  endBattle: update([text], Battle, async (battleId) => {
    /*
        게임 진행 및 정산
      */
    const battle = _getBattleByUuid(battleId);

    // 1. endBattle은 방장(battleAdmin)만이 실행할 수 있다. 먼저 방장이 호출했는지 확인한다.
    const caller = getCaller();
    if (caller !== battle.battleAdmin) {
      throw new Error("Only BattleAdmin can end battle");
    }

    // 2. 참여자들을 돌면서 allowance가 충분한지 확인한다.
    // 2-1. allowance가 충분하지 않으면 배틀에서 제외

    // 3. 참여자들마다 Math.random을 돌리게 한다. retryCount가 1 이상이면, 카운트 수만큼 돌리고, 가장 1에 근접한 수를 result로 삼는다.
    // 각 참여자들의 result를 battle.results에 추가한다.

    for (let character of battle.characters) {
      const allowance = await _allowanceFrom(character.owner);

      if (allowance < battle.betAmount) {
        battle.results.push({
          owner: character.owner,
          result: 0,
          gameResults: [],
          approved: false,
        });
      } else {
        const characterGameResult: Vec<number> = [getRandomNumber()];
        if (character.retryCount > 1) {
          for (let i = 1; i < character.retryCount; i++) {
            characterGameResult.push(getRandomNumber());
          }
        }
        battle.results.push({
          owner: character.owner,
          result: Math.max(...characterGameResult),
          gameResults: characterGameResult,
          approved: true,
        });
      }
    }

    battle.winner = battle.results.reduce((max, curr) => {
      return curr.result > max.result ? curr : max;
    });
    // 4. 1등에게 걸린 모든 베팅금을 transfer한다.
    // 5. 배틀 결과를 각 캐릭터의 배틀 히스토리에 저장한다.
    for (let i = 0; i < battle.results.length; i++) {
      _transferFrom(
        battle.results[i].owner,
        battle.winner.owner,
        battle.betAmount
      );

      const character = _getCharacterByOwner(battle.results[i].owner);
      character.battleHistory.push(battle.id);
    }

    return battle;
  }),
});
