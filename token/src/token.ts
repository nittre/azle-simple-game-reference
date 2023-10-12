import {
  nat64,
  Record,
  $query,
  $update,
  ic,
  match,
  StableBTreeMap,
  Vec,
  Tuple,
} from "azle";

type Account = Record<{
  address: string;
  balance: nat64;
  allowances: Vec<Tuple<[string, nat64]>>;
}>;

const state = new StableBTreeMap<string, Account>(0, 100, 1000);
const admins: Vec<string> = [];

const tokenInfo = {
  name: "",
  ticker: "",
  totalSupply: 0n,
  creatorAddress: "",
};

function isAdmin(address: string): boolean {
  if (admins.indexOf(address) == -1) {
    return false;
  }
  return true;
}

$update;
export function addAdmin(address: string): boolean {
  const caller = getCaller();

  if (!isAdmin(caller)) {
    return false;
  }

  admins.push(address);
  return true;
}

$update;
export function deleteAdmin(address: string): boolean {
  const caller = getCaller();

  if (tokenInfo.creatorAddress != caller) {
    return false;
  }

  const indexToDelete = admins.indexOf(address);

  if (indexToDelete !== -1) {
    admins.splice(indexToDelete, 1);
  }

  return true;
}

$query; // 임시
export function allState(): string {
  const arr: string[] = [];
  for (const k of state.keys()) {
    match(state.get(k), {
      Some: (result) => {
        arr.push(
          JSON.stringify({
            address: result.address,
            balance: result.balance.toString(),
          })
        );
        return true;
      },
      None: () => {},
    });
  }

  return JSON.stringify(arr);
}

export function getCaller(): string {
  const caller = ic.caller().toString();
  if (caller === null) {
    throw new Error("Caller is null");
  }
  return caller;
}

$update;
export function initialize(
  name: string,
  ticker: string,
  totalSupply: nat64
): string {
  const creatorAddress = getCaller();

  // 새로운 계정 생성 및 초기화
  const creatorAccount: Account = {
    address: creatorAddress,
    balance: totalSupply,
    allowances: [],
  };

  tokenInfo.name = name;
  tokenInfo.ticker = ticker;
  tokenInfo.totalSupply = totalSupply;
  tokenInfo.creatorAddress = creatorAddress;
  state.insert(creatorAddress, creatorAccount);
  admins.push(creatorAddress);
  return creatorAddress;
}

$update;
export function transfer(toAddress: string, amount: nat64): boolean {
  const fromAddress = getCaller();

  const fromAccount = match(state.get(fromAddress), {
    Some: (some) => some,
    None: () => {
      throw new Error("fromAccount not found");
    },
  });

  // 수신 계정이 없으면 새로 생성
  const toAccount = match(state.get(toAddress), {
    Some: (some) => some,
    None: () => {
      const newAccount = {
        address: toAddress,
        balance: 0n,
        allowances: [],
      };
      state.insert(toAddress, newAccount);
      return newAccount;
    },
  });

  if (!fromAccount || fromAccount.balance < amount) {
    return false;
  }

  fromAccount.balance -= amount;
  toAccount.balance += amount;

  // 업데이트된 계정 정보를 StableBTreeMap에 다시 삽입
  state.insert(fromAddress, fromAccount);
  state.insert(toAddress, toAccount);

  return true;
}

$query;
export function balanceOf(address: string): nat64 {
  const account = state.get(address);
  return match(account, {
    Some: (some) => some.balance,
    None: () => 0n,
  });
}

$query;
export function ticker(): string {
  return tokenInfo.ticker;
}

$query;
export function name(): string {
  return tokenInfo.name;
}

$query;
export function totalSupply(): nat64 {
  return tokenInfo.totalSupply;
}

$update;
export function approve(spender: string, amount: nat64): boolean {
  const ownerAddress = getCaller();

  const ownerAccount = match(state.get(ownerAddress), {
    Some: (some) => some,
    None: () => {
      throw new Error("fromAccount not found");
    },
  });

  // 수신 계정이 없으면 새로 생성
  const spenderAccount = match(state.get(spender), {
    Some: (some) => some,
    None: () => {
      const newAccount = {
        address: spender,
        balance: 0n,
        allowances: [],
      };
      state.insert(spender, newAccount);
      return newAccount;
    },
  });

  if (!ownerAccount || ownerAccount.balance < amount) {
    return false;
  }

  let exist = false;
  for (let i = 0; i < ownerAccount.allowances.length; i++) {
    JSON.stringify({
      key: ownerAccount.allowances[i][0],
      value: ownerAccount.allowances[i][1].toString(),
    });

    const key = ownerAccount.allowances[i][0];
    const value = ownerAccount.allowances[i][1];

    if (key === spender) {
      exist = true;
      ownerAccount.allowances[i] = [spender, amount];
    }
  }

  if (!exist) {
    ownerAccount.allowances.push([spender, amount]);
  }

  state.insert(ownerAddress, ownerAccount);

  return true;
}

function _allowance(owner: string, spender: string): nat64 {
  const ownerAccount = match(state.get(owner), {
    Some: (some) => some,
    None: () => {
      throw new Error("user not found");
    },
  });

  for (let allowance of ownerAccount.allowances) {
    if (allowance[0] == spender) {
      return allowance[1];
    }
  }
  return 0n;
}

$query; // admin 권한이 있는 외부 컨트랙트가 호출하는 경우
export function allowanceFrom(owner: string): nat64 {
  const ownerAccount = state.get(owner);
  return match(ownerAccount, {
    Some: (some) => {
      const caller = getCaller();
      return _allowance(owner, caller);
    },
    None: () => 0n,
  });
}

$query;
export function allowance(owner: string, spender: string): nat64 {
  return match(state.get(owner), {
    Some: (some) => _allowance(owner, spender),
    None: () => 0n,
  });
}

$update;
export function transferFrom(
  fromAddress: string,
  toAddress: string,
  amount: nat64
): boolean {
  const spender = getCaller();
  const spenderAccount = match(state.get(spender), {
    Some: (some) => some,
    None: () => {
      throw new Error("spender account not found");
    },
  });

  const fromAccount = match(state.get(fromAddress), {
    Some: (some) => some,
    None: () => {
      throw new Error("from account not found");
    },
  });

  const allowance = _allowance(fromAddress, spender);
  if (allowance === undefined || allowance < amount) {
    return false; // insufficient allowance
  }

  // 수신 계정이 없으면 새로 생성
  const toAccount = match(state.get(toAddress), {
    Some: (some) => some,
    None: () => {
      const newAccount = {
        address: toAddress,
        balance: 0n,
        allowances: [],
      };
      state.insert(toAddress, newAccount);
      return newAccount;
    },
  });

  // perform the transfer
  fromAccount.balance -= amount;
  toAccount.balance += amount;
  state.insert(fromAddress, fromAccount);
  state.insert(toAddress, toAccount);

  // fromAccount - spender 간의 allowance 갱신
  for (let i = 0; i < fromAccount.allowances.length; i++) {
    const item = fromAccount.allowances[i];
    if (fromAccount.allowances[i][0] === spender) {
      fromAccount.allowances[i] = [
        spender,
        fromAccount.allowances[i][1] - amount,
      ];
    }
  }

  state.insert(fromAddress, fromAccount);

  return true;
}

$update;
export function mint(to: string, amount: nat64): boolean {
  const caller = getCaller();

  const callerAccount = match(state.get(caller), {
    Some: (some) => some,
    None: () => {
      throw new Error("Caller account not found");
    },
  });

  if (admins.indexOf(caller) == -1) {
    throw new Error("Only admins can mint new tokens");
  }

  const toAccount = match(state.get(to), {
    Some: (some) => some,
    None: () => {
      throw new Error("Recipient account not found");
    },
  });

  toAccount.balance += amount;
  tokenInfo.totalSupply += amount;

  state.insert(to, toAccount);
  return true;
}

$update;
export function burn(from: string, amount: nat64): boolean {
  const caller = getCaller();

  if (admins.indexOf(caller) == -1) {
    throw new Error("Only admins can burn tokens");
  }

  const callerAccount = match(state.get(caller), {
    Some: (some) => some,
    None: () => {
      throw new Error("Caller account not found");
    },
  });

  if (allowance(from, caller) < amount) {
    throw new Error("Insufficient allowance to burn");
  }

  if (tokenInfo.totalSupply < amount) {
    throw new Error("Insufficient tokens to burn");
  }
  transferFrom(from, "0", amount);
  tokenInfo.totalSupply -= amount;

  state.insert(caller, callerAccount);
  return true;
}
